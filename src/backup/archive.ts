// Backup archive: export → validate (staged, no DB access) → commit (one atomic transaction).
// Format: one JSON document, optionally wrapped in a WebCrypto AES-GCM envelope (see crypto.ts).
import { SCHEMA_VERSION, type Ledger } from '../db/db';
import type { Food, ImageAsset, MealEntry, Recipe, Settings } from '../domain/types';
import { base64ToBytes, bytesToBase64, sameDigest, sha256Hex, sniffMatches } from './codec';
import { checkEnvelope, decryptEnvelope, encryptBytes, ENCRYPTED_FORMAT, WrongPassphraseError, type EncryptedEnvelope } from './crypto';
import { checkEntry, checkFavorites, checkFood, checkRecipe, checkSettings, Errs, ID_RE, walkTree } from './schema';

export const BACKUP_FORMAT = 'thali-backup';
export const BACKUP_FORMAT_VERSION = 1;
/** Keep in step with package.json "version". */
export const APP_VERSION = '0.1.0';
export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // same cap as repo.putImage
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

export interface Counts {
  entries: number;
  foods: number;
  recipes: number;
  images: number;
}

interface ArchiveImage {
  id: string;
  mime: string;
  createdAt: string;
  base64: string;
  sha256: string;
}

interface ArchiveData {
  entries: MealEntry[];
  foods: Food[];
  recipes: Recipe[];
  kv: { settings: Partial<Settings> | null; favorites: string[] | null };
}

export interface BackupArchive {
  format: typeof BACKUP_FORMAT;
  formatVersion: 1;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  manifest: {
    counts: Counts;
    includesPhotos: boolean;
    sha256: { entries: string; foods: string; recipes: string; kv: string; images: string };
  };
  data: ArchiveData;
  images: ArchiveImage[];
}

export interface ExportOptions {
  includePhotos: boolean;
  /** When set, the archive is encrypted (PBKDF2-SHA256 600k → AES-256-GCM). */
  passphrase?: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Suggested file name, e.g. thali-backup-2026-10-11.json (local date). */
export function backupFilename(d = new Date(), prefix = 'thali-backup'): string {
  return `${prefix}-${localDay(d)}.json`;
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const imageIndex = (imgs: ArchiveImage[]) => imgs.map(({ id, mime, createdAt, sha256 }) => ({ id, mime, createdAt, sha256 }));

async function readAll(db: Ledger, includePhotos: boolean) {
  // One read transaction = consistent snapshot. Blob bytes are read after it completes.
  const tx = db.transaction(['entries', 'foods', 'recipes', 'images', 'kv'], 'readonly');
  const [entries, foods, recipes, images, settings, favorites] = await Promise.all([
    tx.objectStore('entries').getAll(),
    tx.objectStore('foods').getAll(),
    tx.objectStore('recipes').getAll(),
    includePhotos ? tx.objectStore('images').getAll() : Promise.resolve([] as ImageAsset[]),
    tx.objectStore('kv').get('settings'),
    tx.objectStore('kv').get('favorites'),
  ]);
  await tx.done;
  return { entries, foods, recipes, images, settings, favorites };
}

/** Build a backup file. Never sends anything anywhere; the caller decides where it goes. */
export async function exportArchive(db: Ledger, opts: ExportOptions): Promise<Blob> {
  const raw = await readAll(db, opts.includePhotos);

  const images: ArchiveImage[] = [];
  for (const img of raw.images.sort(byId)) {
    if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(img.mime) || !ID_RE.test(img.id)) continue;
    const bytes = new Uint8Array(await img.blob.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || !sniffMatches(img.mime, bytes)) continue;
    images.push({ id: img.id, mime: img.mime, createdAt: img.createdAt, base64: bytesToBase64(bytes), sha256: await sha256Hex(bytes) });
  }
  const kept = new Set(images.map((i) => i.id));
  // Photo links that would dangle (data-only export, or a skipped image) are dropped from the copy.
  const entries = raw.entries.sort(byId).map((e) => {
    if (e.imageId === undefined || kept.has(e.imageId)) return e;
    const { imageId: _drop, ...rest } = e;
    return rest as MealEntry;
  });

  const data: ArchiveData = {
    entries,
    foods: raw.foods.sort(byId),
    recipes: raw.recipes.sort(byId),
    kv: {
      settings: (raw.settings as Partial<Settings> | undefined) ?? null,
      favorites: (raw.favorites as string[] | undefined) ?? null,
    },
  };
  const archive: BackupArchive = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    manifest: {
      counts: { entries: data.entries.length, foods: data.foods.length, recipes: data.recipes.length, images: images.length },
      includesPhotos: opts.includePhotos,
      sha256: {
        entries: await sha256Hex(JSON.stringify(data.entries)),
        foods: await sha256Hex(JSON.stringify(data.foods)),
        recipes: await sha256Hex(JSON.stringify(data.recipes)),
        kv: await sha256Hex(JSON.stringify(data.kv)),
        images: await sha256Hex(JSON.stringify(imageIndex(images))),
      },
    },
    data,
    images,
  };
  const json = JSON.stringify(archive);
  if (!opts.passphrase) return new Blob([json], { type: 'application/json' });
  const env = await encryptBytes(new TextEncoder().encode(json), opts.passphrase);
  return new Blob([JSON.stringify(env)], { type: 'application/json' });
}

// ---- validation -------------------------------------------------------------------------

/** Records ready to write. Only objects produced by validateArchive are accepted by commitRestore. */
export interface StagedRestore {
  readonly schemaVersion: number;
  readonly entries: MealEntry[];
  readonly foods: Food[];
  readonly recipes: Recipe[];
  readonly settings: Partial<Settings> | null;
  readonly favorites: string[] | null;
  readonly images: ImageAsset[];
}

export interface RestoreSummary {
  entries: number;
  foods: number;
  recipes: number;
  images: number;
  /** Earliest and latest diary date in the backup, or null when it has no entries. */
  dateRange: { from: string; to: string } | null;
  createdAt: string;
  schemaVersion: number;
  appVersion: string;
  encrypted: boolean;
  includesPhotos: boolean;
  /** Age setting stored in the backup (UI warns if it differs from the current one). */
  ageBand: Settings['ageBand'] | null;
  warnings: string[];
}

export type ValidateResult =
  | { ok: true; summary: RestoreSummary; staged: StagedRestore }
  | { ok: false; errors: string[]; needsPassphrase?: boolean };

const validated = new WeakSet<object>();
const fail = (...errors: string[]): ValidateResult => ({ ok: false, errors });
const NOT_BACKUP = 'This file is not a Thali backup.';
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const HEX64 = /^[0-9a-f]{64}$/;
/** Only these exact paths may hold strings longer than the generic text cap. */
const BIG_STRING_OK = (path: string) => path === 'file.ciphertext' || /^file\.images\[\d+\]\.base64$/.test(path);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Read and fully check a backup file in memory. Does not touch the database.
 * Returns a summary for the user to confirm plus staged records for commitRestore.
 */
export async function validateArchive(file: Blob, passphrase?: string): Promise<ValidateResult> {
  if (!(file instanceof Blob)) return fail('No file selected.');
  if (file.size === 0) return fail('The file is empty.');
  if (file.size > MAX_ARCHIVE_BYTES)
    return fail(`The file is too large (${(file.size / 1048576).toFixed(0)} MB). Backups up to ${MAX_ARCHIVE_BYTES / 1048576} MB are supported.`);

  let root = parseJson(await file.text());
  if (!isObj(root)) return fail(`${NOT_BACKUP} (It is not a valid backup document.)`);
  const e = new Errs();
  walkTree(root, 'file', e, BIG_STRING_OK);
  if (!e.ok) return fail(...e.list);

  let encrypted = false;
  if (root.format === ENCRYPTED_FORMAT) {
    const envErrs = checkEnvelope(root);
    if (envErrs.length) return fail(...envErrs);
    if (!passphrase) return { ok: false, errors: ['This backup is encrypted. Enter its passphrase to open it.'], needsPassphrase: true };
    let plain: Uint8Array;
    try {
      plain = await decryptEnvelope(root as unknown as EncryptedEnvelope, passphrase);
    } catch (err) {
      if (err instanceof WrongPassphraseError) return { ok: false, errors: [err.message], needsPassphrase: true };
      return fail('The encrypted backup is damaged.');
    }
    if (plain.length > MAX_ARCHIVE_BYTES) return fail('The decrypted backup is too large.');
    root = parseJson(new TextDecoder().decode(plain));
    if (!isObj(root) || root.format !== BACKUP_FORMAT) return fail('The decrypted content is not a Thali backup.');
    walkTree(root, 'file', e, BIG_STRING_OK);
    if (!e.ok) return fail(...e.list);
    encrypted = true;
  }

  if (root.format !== BACKUP_FORMAT) return fail(NOT_BACKUP);
  if (root.formatVersion !== BACKUP_FORMAT_VERSION)
    return fail(
      typeof root.formatVersion === 'number' && root.formatVersion > BACKUP_FORMAT_VERSION
        ? 'This backup was made by a newer version of Thali. Update the app, then try again.'
        : 'Unsupported backup format version.',
    );
  const sv = root.schemaVersion;
  if (!Number.isInteger(sv) || (sv as number) < 1) return fail('The backup has an invalid data version.');
  if ((sv as number) > SCHEMA_VERSION)
    return fail(`This backup uses a newer data version (${sv}) than this app supports (${SCHEMA_VERSION}). Update the app, then try again.`);
  if (typeof root.createdAt !== 'string' || Number.isNaN(Date.parse(root.createdAt))) return fail('The backup has an invalid creation date.');
  const appVersion = typeof root.appVersion === 'string' && root.appVersion.length <= 32 ? root.appVersion : 'unknown';

  const manifest = root.manifest;
  const data = root.data;
  const images = root.images;
  if (!isObj(manifest) || !isObj(manifest.sha256) || !isObj(manifest.counts) || !isObj(data) || !Array.isArray(images))
    return fail(`${NOT_BACKUP} (Required sections are missing.)`);
  const { entries, foods, recipes, kv } = data;
  if (!Array.isArray(entries) || !Array.isArray(foods) || !Array.isArray(recipes) || !isObj(kv))
    return fail(`${NOT_BACKUP} (Data sections are malformed.)`);
  if (!walkImagesOk(images, e)) return fail(...e.list);

  // Integrity: every section must match the checksum recorded at export time.
  const sums = manifest.sha256;
  const sections: [string, unknown][] = [
    ['entries', entries],
    ['foods', foods],
    ['recipes', recipes],
    ['kv', kv],
    ['images', imageIndex(images as ArchiveImage[])],
  ];
  for (const [name, value] of sections) {
    if (typeof sums[name] !== 'string' || !HEX64.test(sums[name] as string)) return fail(`Checksum for "${name}" is missing.`);
    if (!sameDigest(sums[name], await sha256Hex(JSON.stringify(value))))
      return fail(`Checksum mismatch in "${name}": the file was changed or damaged after it was made.`);
  }
  const c = manifest.counts;
  if (c.entries !== entries.length || c.foods !== foods.length || c.recipes !== recipes.length || c.images !== images.length)
    return fail('Record counts do not match the manifest: the file is damaged.');

  // Record shapes and duplicate ids.
  const dupCheck = (list: unknown[], label: string) => {
    const seen = new Set<string>();
    for (const r of list) {
      const id = (r as { id?: unknown })?.id;
      if (typeof id !== 'string') continue;
      if (seen.has(id)) e.push(`Duplicate ${label} id "${id.slice(0, 40)}".`);
      seen.add(id);
    }
  };
  entries.forEach((r, i) => checkEntry(e, `entries[${i}]`, r));
  foods.forEach((r, i) => checkFood(e, `foods[${i}]`, r));
  recipes.forEach((r, i) => checkRecipe(e, `recipes[${i}]`, r));
  if (kv.settings !== null) checkSettings(e, 'settings', kv.settings);
  if (kv.favorites !== null) checkFavorites(e, 'favorites', kv.favorites);
  dupCheck(entries, 'diary entry');
  dupCheck(foods, 'food');
  dupCheck(recipes, 'recipe');
  dupCheck(images, 'photo');
  if (!e.ok) return fail(...e.list);

  // Photos: decode, verify size, checksum and file signature.
  const assets: ImageAsset[] = [];
  for (const [i, img] of (images as ArchiveImage[]).entries()) {
    const p = `images[${i}]`;
    const bytes = base64ToBytes(img.base64);
    if (!bytes || bytes.length === 0) {
      e.push(`${p}: photo data is not valid base64.`);
      continue;
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      e.push(`${p}: photo is larger than 15 MB.`);
      continue;
    }
    if (!sameDigest(img.sha256, await sha256Hex(bytes))) {
      e.push(`${p}: photo checksum mismatch.`);
      continue;
    }
    if (!sniffMatches(img.mime, bytes)) {
      e.push(`${p}: photo content does not match its type (${img.mime}).`);
      continue;
    }
    assets.push({ id: img.id, mime: img.mime, createdAt: img.createdAt, blob: new Blob([bytes as BlobPart], { type: img.mime }) });
  }
  if (!e.ok) return fail(...e.list);

  const entryList = entries as MealEntry[];
  const imageIds = new Set(assets.map((a) => a.id));
  const missingPhotos = entryList.filter((x) => x.imageId && !imageIds.has(x.imageId)).length;
  const warnings: string[] = [];
  if (missingPhotos) warnings.push(`${missingPhotos} diary entries refer to photos that are not in this backup.`);

  const dates = entryList.map((x) => x.localDate).sort();
  const settings = (kv.settings as Partial<Settings> | null) ?? null;
  const staged: StagedRestore = {
    schemaVersion: sv as number,
    entries: entryList,
    foods: foods as Food[],
    recipes: recipes as Recipe[],
    settings,
    favorites: (kv.favorites as string[] | null) ?? null,
    images: assets,
  };
  validated.add(staged);
  return {
    ok: true,
    staged,
    summary: {
      entries: entryList.length,
      foods: foods.length,
      recipes: recipes.length,
      images: assets.length,
      dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      createdAt: root.createdAt,
      schemaVersion: sv as number,
      appVersion,
      encrypted,
      includesPhotos: manifest.includesPhotos === true,
      ageBand: settings?.ageBand ?? null,
      warnings,
    },
  };
}

/** Image metadata checks (everything except decoding). */
function walkImagesOk(images: unknown[], e: Errs): boolean {
  images.forEach((img, i) => {
    const p = `images[${i}]`;
    if (!isObj(img)) return e.push(`${p}: expected a photo record.`);
    if (typeof img.id !== 'string' || !ID_RE.test(img.id)) e.push(`${p}.id: invalid format.`);
    if (typeof img.mime !== 'string' || !(ALLOWED_IMAGE_MIME as readonly string[]).includes(img.mime))
      e.push(`${p}.mime: only JPEG, PNG, WebP and HEIC/HEIF photos are accepted.`);
    if (typeof img.createdAt !== 'string' || img.createdAt.length > 64 || Number.isNaN(Date.parse(img.createdAt))) e.push(`${p}.createdAt: invalid timestamp.`);
    if (typeof img.base64 !== 'string') e.push(`${p}.base64: missing photo data.`);
    if (typeof img.sha256 !== 'string' || !HEX64.test(img.sha256)) e.push(`${p}.sha256: missing checksum.`);
  });
  return e.ok;
}

// ---- commit -----------------------------------------------------------------------------

export type RestoreMode = 'replace' | 'merge';

export interface RestoreResult {
  mode: RestoreMode;
  added: Counts;
  /** Merge only: records skipped because the id already exists on this device. */
  skipped: Counts;
  /** Replace only: full export of the data that was on the device before the restore. */
  safetyExport?: Blob;
  safetyFilename?: string;
}

const STORES = ['entries', 'foods', 'recipes', 'images', 'kv'] as const;
const zero = (): Counts => ({ entries: 0, foods: 0, recipes: 0, images: 0 });

/** Read-only counts of what is on the device now (for "replace will remove N entries" copy). */
export async function currentCounts(db: Ledger): Promise<Counts> {
  const tx = db.transaction(['entries', 'foods', 'recipes', 'images'], 'readonly');
  const [entries, foods, recipes, images] = await Promise.all([
    tx.objectStore('entries').count(),
    tx.objectStore('foods').count(),
    tx.objectStore('recipes').count(),
    tx.objectStore('images').count(),
  ]);
  await tx.done;
  return { entries, foods, recipes, images };
}

/**
 * Write staged records.
 * - replace: first builds a safety export of current data (returned), then clears and rewrites
 *   every store in ONE readwrite transaction. Any failure aborts it and current data remains.
 * - merge: adds records whose ids are not on the device; never overwrites. Settings are kept;
 *   favorites become the union.
 */
export async function commitRestore(
  db: Ledger,
  staged: StagedRestore,
  mode: RestoreMode,
  opts: { safetyPassphrase?: string } = {},
): Promise<RestoreResult> {
  if (!validated.has(staged)) throw new Error('Restore data was not validated.');
  if (mode !== 'replace' && mode !== 'merge') throw new Error('Unknown restore mode.');

  let safetyExport: Blob | undefined;
  if (mode === 'replace') safetyExport = await exportArchive(db, { includePhotos: true, passphrase: opts.safetyPassphrase });

  const added = zero();
  const skipped = zero();
  const tx = db.transaction([...STORES], 'readwrite');
  const ops: Promise<unknown>[] = [];
  try {
    const entries = tx.objectStore('entries');
    const foods = tx.objectStore('foods');
    const recipes = tx.objectStore('recipes');
    const images = tx.objectStore('images');
    const kv = tx.objectStore('kv');

    if (mode === 'replace') {
      ops.push(entries.clear(), foods.clear(), recipes.clear(), images.clear(), kv.delete('settings'), kv.delete('favorites'));
      for (const r of staged.entries) ops.push(entries.put(r));
      for (const r of staged.foods) ops.push(foods.put(r));
      for (const r of staged.recipes) ops.push(recipes.put(r));
      for (const r of staged.images) ops.push(images.put(r));
      if (staged.settings) ops.push(kv.put(staged.settings, 'settings'));
      if (staged.favorites) ops.push(kv.put(staged.favorites, 'favorites'));
      Object.assign(added, { entries: staged.entries.length, foods: staged.foods.length, recipes: staged.recipes.length, images: staged.images.length });
    } else {
      const [eKeys, fKeys, rKeys, iKeys, curSettings, curFavs] = await Promise.all([
        entries.getAllKeys(),
        foods.getAllKeys(),
        recipes.getAllKeys(),
        images.getAllKeys(),
        kv.get('settings'),
        kv.get('favorites'),
      ]);
      const addNew = <T extends { id: string }>(
        list: readonly T[],
        have: string[],
        store: { add(v: T): Promise<unknown> },
        k: keyof Counts,
      ) => {
        const set = new Set(have);
        for (const r of list) {
          if (set.has(r.id)) skipped[k]++;
          else {
            set.add(r.id);
            ops.push(store.add(r));
            added[k]++;
          }
        }
      };
      addNew(staged.entries, eKeys, entries, 'entries');
      addNew(staged.foods, fKeys, foods, 'foods');
      addNew(staged.recipes, rKeys, recipes, 'recipes');
      addNew(staged.images, iKeys, images, 'images');
      if (staged.settings && curSettings === undefined) ops.push(kv.put(staged.settings, 'settings'));
      if (staged.favorites) {
        const cur = Array.isArray(curFavs) ? (curFavs as string[]) : [];
        const union = [...cur, ...staged.favorites.filter((f) => !cur.includes(f))];
        if (union.length !== cur.length) ops.push(kv.put(union, 'favorites'));
      }
    }
    await Promise.all(ops);
    await tx.done;
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already aborted by the failing request.
    }
    await Promise.allSettled([tx.done, ...ops]);
    throw err;
  }
  return mode === 'replace'
    ? { mode, added, skipped, safetyExport, safetyFilename: backupFilename(new Date(), 'thali-pre-restore') }
    : { mode, added, skipped };
}
