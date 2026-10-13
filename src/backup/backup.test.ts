import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openLedger, type Ledger } from '../db/db';
import type { Food, ImageAsset, MealEntry, Recipe, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import {
  backupFilename,
  commitRestore,
  exportArchive,
  MAX_ARCHIVE_BYTES,
  validateArchive,
  type BackupArchive,
  type StagedRestore,
} from './archive';
import { base64ToBytes, bytesToBase64, sha256Hex } from './codec';

// ---- fixtures ---------------------------------------------------------------------------

let n = 0;
const freshDb = () => openLedger(`backup-test-${++n}-${Math.random()}`);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 250, 251, 252]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]);

const src = { kind: 'user', name: 'test' } as const;
const food = (id: string, name: string): Food => ({
  id,
  name,
  aliases: ['alias'],
  state: 'cooked',
  tags: ['pulse'],
  source: { ...src, url: 'https://example.org/x' },
  per100g: { energy_kcal: { amount: 120, kind: 'user' }, fiber_g: { amount: null, kind: 'user', missingReason: 'not on label' } },
  servings: [{ label: '1 katori', grams: 150, evidence: 'weighed at home', source: 'user_calibrated' }],
  revision: 1,
  updatedAt: '2026-10-01T10:00:00.000Z',
});
const entry = (id: string, localDate: string, extra: Partial<MealEntry> = {}): MealEntry => ({
  id,
  localDate,
  meal: 'lunch',
  loggedAtUtc: `${localDate}T07:30:00.000Z`,
  tzOffsetMin: 330,
  item: { kind: 'food', refId: 'c:dal', name: 'Dal', source: src, revision: 1 },
  portion: { quantity: 1, unit: '1 katori', grams: 150, conversionEvidence: 'weighed at home' },
  nutrients: { values: { energy_kcal: 180 }, incomplete: ['fiber_g'] },
  per100g: { energy_kcal: { amount: 120, kind: 'user' } },
  estimate: 'measured',
  updatedAt: `${localDate}T07:30:00.000Z`,
  ...extra,
});
const recipe: Recipe = {
  id: 'r:rajma',
  name: 'Rajma',
  aliases: [],
  ingredients: [{ foodId: 'c:dal', foodName: 'Dal', per100g: { protein_g: { amount: 9, kind: 'user' } }, source: src, state: 'cooked', grams: 300 }],
  yieldGrams: 900,
  servings: 4,
  method: 'Soak overnight.',
  revision: 2,
  updatedAt: '2026-09-20T10:00:00.000Z',
};
const settings: Settings = { ...DEFAULT_SETTINGS, ageBand: 'adult', theme: 'dark', onboarded: true, keepPhotos: true };

async function seed(db: Ledger) {
  const tx = db.transaction(['entries', 'foods', 'recipes', 'images', 'kv'], 'readwrite');
  await Promise.all([
    tx.objectStore('entries').put(entry('e1', '2026-10-01', { imageId: 'img1', note: 'with ghee' })),
    tx.objectStore('entries').put(entry('e2', '2026-10-05')),
    tx.objectStore('foods').put(food('c:dal', 'Dal')),
    tx.objectStore('foods').put(food('c:poha', 'Poha')),
    tx.objectStore('recipes').put(recipe),
    tx.objectStore('images').put({ id: 'img1', mime: 'image/png', createdAt: '2026-10-01T07:31:00.000Z', blob: new Blob([PNG], { type: 'image/png' }) }),
    tx.objectStore('kv').put(settings, 'settings'),
    tx.objectStore('kv').put(['c:dal'], 'favorites'),
    tx.objectStore('kv').put([{ id: 'w1', localDate: '2026-10-01', ml: 250, at: '2026-10-01T08:00:00.000Z' }], 'water'),
  ]);
  await tx.done;
}

async function snapshot(db: Ledger) {
  const images = await db.getAll('images');
  return {
    entries: await db.getAll('entries'),
    foods: await db.getAll('foods'),
    recipes: await db.getAll('recipes'),
    settings: await db.get('kv', 'settings'),
    favorites: await db.get('kv', 'favorites'),
    water: await db.get('kv', 'water'),
    images: await Promise.all(
      images.map(async (i: ImageAsset) => ({ id: i.id, mime: i.mime, createdAt: i.createdAt, bytes: Array.from(new Uint8Array(await i.blob.arrayBuffer())) })),
    ),
  };
}

const textBlob = (s: string) => new Blob([s], { type: 'application/json' });

/** Re-sign a modified plain archive so only the targeted defence can reject it. */
async function rehash(a: BackupArchive): Promise<Blob> {
  const idx = a.images.map(({ id, mime, createdAt, sha256 }) => ({ id, mime, createdAt, sha256 }));
  a.manifest.counts = { entries: a.data.entries.length, foods: a.data.foods.length, recipes: a.data.recipes.length, images: a.images.length };
  a.manifest.sha256 = {
    entries: await sha256Hex(JSON.stringify(a.data.entries)),
    foods: await sha256Hex(JSON.stringify(a.data.foods)),
    recipes: await sha256Hex(JSON.stringify(a.data.recipes)),
    kv: await sha256Hex(JSON.stringify(a.data.kv)),
    images: await sha256Hex(JSON.stringify(idx)),
  };
  return textBlob(JSON.stringify(a));
}

async function plainArchive(includePhotos = true): Promise<BackupArchive> {
  const db = await freshDb();
  await seed(db);
  return JSON.parse(await (await exportArchive(db, { includePhotos })).text());
}

async function expectRejected(blob: Blob, match: RegExp, passphrase?: string) {
  const r = await validateArchive(blob, passphrase);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.join(' | ')).toMatch(match);
  return r;
}

// ---- tests ------------------------------------------------------------------------------

describe('codec', () => {
  it('base64 round-trips and rejects malformed input', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(base64ToBytes('abc')).toBeNull();
    expect(base64ToBytes('ab c')).toBeNull();
    expect(base64ToBytes('a===')).toBeNull();
  });
  it('suggests a dated file name', () => {
    expect(backupFilename(new Date(2026, 9, 3))).toBe('thali-backup-2026-10-03.json');
  });
});

describe('export → validate → replace', () => {
  it('round-trips entries, foods, recipes, settings, favorites and photos exactly', async () => {
    const a = await freshDb();
    await seed(a);
    const before = await snapshot(a);
    const file = await exportArchive(a, { includePhotos: true });
    const doc = JSON.parse(await file.text()) as BackupArchive;
    expect(doc.format).toBe('thali-backup');
    expect(doc.formatVersion).toBe(1);
    expect(doc.manifest.counts).toEqual({ entries: 2, foods: 2, recipes: 1, images: 1 });

    const v = await validateArchive(file);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.summary).toMatchObject({ entries: 2, foods: 2, recipes: 1, images: 1, dateRange: { from: '2026-10-01', to: '2026-10-05' }, encrypted: false, ageBand: 'adult' });

    const b = await freshDb();
    await b.put('entries', entry('other', '2025-01-01'));
    await b.put('kv', { ...DEFAULT_SETTINGS, ageBand: 'under18' }, 'settings');
    const res = await commitRestore(b, v.staged, 'replace');
    expect(await snapshot(b)).toEqual(before);
    expect(res.added).toEqual({ entries: 2, foods: 2, recipes: 1, images: 1 });

    // The safety export holds what was on device B before the restore.
    expect(res.safetyFilename).toMatch(/^thali-pre-restore-\d{4}-\d{2}-\d{2}\.json$/);
    const safety = await validateArchive(res.safetyExport!);
    expect(safety.ok && safety.staged.entries.map((e) => e.id)).toEqual(['other']);
    expect(safety.ok && safety.summary.ageBand).toBe('under18');
  });

  it('data-only export drops photos and photo links', async () => {
    const doc = await plainArchive(false);
    expect(doc.images).toEqual([]);
    expect(doc.manifest.includesPhotos).toBe(false);
    expect(doc.data.entries.some((e) => 'imageId' in e)).toBe(false);
    expect((await validateArchive(textBlob(JSON.stringify(doc)))).ok).toBe(true);
  });
});

describe('encryption', () => {
  it('round-trips with the right passphrase and hides content', async () => {
    const a = await freshDb();
    await seed(a);
    const file = await exportArchive(a, { includePhotos: true, passphrase: 'correct horse battery staple' });
    const text = await file.text();
    expect(text).not.toContain('Dal');
    const env = JSON.parse(text);
    expect(env).toMatchObject({ format: 'thali-backup-encrypted', formatVersion: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 }, cipher: { name: 'AES-GCM' } });

    const locked = await validateArchive(file);
    expect(locked.ok === false && locked.needsPassphrase).toBe(true);

    const v = await validateArchive(file, 'correct horse battery staple');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.summary.encrypted).toBe(true);
    const b = await freshDb();
    await commitRestore(b, v.staged, 'replace');
    expect(await snapshot(b)).toEqual(await snapshot(a));
  });

  it('reports a wrong passphrase clearly', async () => {
    const a = await freshDb();
    await seed(a);
    const file = await exportArchive(a, { includePhotos: false, passphrase: 'right one' });
    const r = await expectRejected(file, /wrong passphrase/i, 'wrong one');
    expect(r.ok === false && r.needsPassphrase).toBe(true);
  });

  it('detects tampering with the encrypted header or ciphertext', async () => {
    const a = await freshDb();
    await seed(a);
    const env = JSON.parse(await (await exportArchive(a, { includePhotos: false, passphrase: 'pw' })).text());
    const ct = base64ToBytes(env.ciphertext)!;
    ct[5] ^= 1;
    await expectRejected(textBlob(JSON.stringify({ ...env, ciphertext: bytesToBase64(ct) })), /wrong passphrase|damaged/i, 'pw');
    await expectRejected(textBlob(JSON.stringify({ ...env, kdf: { ...env.kdf, iterations: 100 } })), /iteration/i, 'pw');
  });
});

describe('validation defences', () => {
  it('rejects a checksum mismatch', async () => {
    const doc = await plainArchive();
    doc.data.entries[0].note = 'edited after export';
    await expectRejected(textBlob(JSON.stringify(doc)), /checksum mismatch in "entries"/i);
    const doc2 = await plainArchive();
    doc2.images[0].base64 = bytesToBase64(new Uint8Array([...PNG, 9]));
    await expectRejected(await rehash(doc2), /photo checksum mismatch/i);
  });

  it('rejects duplicate ids', async () => {
    const doc = await plainArchive();
    doc.data.entries.push({ ...doc.data.entries[0], note: 'dupe' });
    await expectRejected(await rehash(doc), /duplicate diary entry id "e1"/i);
    const doc2 = await plainArchive();
    doc2.images.push({ ...doc2.images[0] });
    await expectRejected(await rehash(doc2), /duplicate photo id/i);
  });

  it('rejects a newer schema or format version', async () => {
    const doc = await plainArchive();
    doc.schemaVersion = 99;
    await expectRejected(textBlob(JSON.stringify(doc)), /newer data version \(99\)/);
    const doc2 = await plainArchive();
    (doc2 as { formatVersion: number }).formatVersion = 2;
    await expectRejected(textBlob(JSON.stringify(doc2)), /newer version of Thali/);
  });

  it('rejects oversized, empty, non-JSON and foreign files', async () => {
    class Huge extends Blob {
      get size() {
        return MAX_ARCHIVE_BYTES + 1;
      }
    }
    await expectRejected(new Huge(['{}']), /too large/);
    await expectRejected(textBlob(''), /empty/);
    await expectRejected(textBlob('{"format": "thali-backup", '), /not a Thali backup/);
    await expectRejected(textBlob('[1,2,3]'), /not a Thali backup/);
    await expectRejected(textBlob('{"format":"something-else"}'), /not a Thali backup/);
    await expectRejected(textBlob(JSON.stringify({ format: 'thali-backup', formatVersion: 1, schemaVersion: 1, createdAt: new Date().toISOString() })), /missing/);
  });

  it('rejects prototype-pollution keys without polluting', async () => {
    const doc = await plainArchive();
    const text = JSON.stringify(doc).replace('"id":"e1"', '"__proto__":{"polluted":true},"id":"e1"');
    await expectRejected(textBlob(text), /forbidden key "__proto__"/);
    const text2 = JSON.stringify(doc).replace('"settings":{', '"settings":{"constructor":{"prototype":{"polluted":true}},');
    await expectRejected(textBlob(text2), /forbidden key "constructor"/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects malformed records and out-of-range values', async () => {
    const cases: [(d: BackupArchive) => void, RegExp][] = [
      [(d) => (d.data.entries[0].portion.grams = -5), /portion\.grams: number out of range/],
      [(d) => (d.data.entries[0].id = '../../etc/passwd'), /entries\[0\]\.id: invalid format/],
      [(d) => (d.data.entries[0].localDate = '2026-13-45'), /invalid date/],
      [(d) => (d.data.entries[0].meal = 'brunch' as never), /meal: unexpected value/],
      [(d) => (d.data.foods[0].name = 'x'.repeat(201)), /foods\[0\]\.name: text length/],
      [(d) => (d.data.foods[0].source.url = 'javascript:alert(1)'), /source\.url: invalid format/],
      [(d) => (d.data.foods[0].per100g.energy_kcal = { amount: 1e9, kind: 'user' }), /number out of range/],
      [(d) => (d.data.recipes[0].ingredients = 'nope' as never), /ingredients: expected a list/],
      [(d) => (d.data.entries[0].note = 'y'.repeat(30_000)), /text is too long/],
      [(d) => ((d.data.kv.settings as Settings).ageBand = 'child' as never), /settings\.ageBand/],
      [(d) => (d.images[0].mime = 'image/svg+xml'), /only JPEG, PNG, WebP and HEIC/],
      [(d) => (d.images[0].base64 = '***not base64***'), /not valid base64/],
    ];
    for (const [mutate, match] of cases) {
      const doc = await plainArchive();
      mutate(doc);
      await expectRejected(await rehash(doc), match);
    }
  });

  it('rejects a photo whose bytes do not match its declared type', async () => {
    const doc = await plainArchive();
    doc.images[0].mime = 'image/jpeg'; // bytes are PNG
    await expectRejected(await rehash(doc), /does not match its type/);
    doc.images[0].base64 = bytesToBase64(JPEG);
    doc.images[0].sha256 = await sha256Hex(JPEG);
    expect((await validateArchive(await rehash(doc))).ok).toBe(true);
  });

  it('never touches the database during validation', async () => {
    const db = await freshDb();
    await seed(db);
    const before = await snapshot(db);
    const doc = await plainArchive();
    doc.data.entries[0].id = 'brand-new';
    const v = await validateArchive(await rehash(doc));
    expect(v.ok).toBe(true);
    expect(await snapshot(db)).toEqual(before);
  });
});

describe('merge', () => {
  it('adds missing records and never overwrites existing ones', async () => {
    const doc = await plainArchive();
    const v = await validateArchive(textBlob(JSON.stringify(doc)));
    if (!v.ok) throw new Error(v.errors.join());

    const b = await freshDb();
    const mine = entry('e1', '2026-10-01', { note: 'my newer note' });
    const mySettings = { ...DEFAULT_SETTINGS, ageBand: 'under18' as const, showCalories: false };
    await b.put('entries', mine);
    await b.put('foods', food('c:dal', 'My dal'));
    await b.put('kv', mySettings, 'settings');
    await b.put('kv', ['c:mine'], 'favorites');

    const res = await commitRestore(b, v.staged, 'merge');
    expect(res.safetyExport).toBeUndefined();
    expect(res.added).toEqual({ entries: 1, foods: 1, recipes: 1, images: 1 });
    expect(res.skipped).toEqual({ entries: 1, foods: 1, recipes: 0, images: 0 });
    expect(await b.get('entries', 'e1')).toEqual(mine);
    expect((await b.get('foods', 'c:dal'))!.name).toBe('My dal');
    expect(await b.get('entries', 'e2')).toBeDefined();
    expect(await b.get('kv', 'settings')).toEqual(mySettings);
    expect(await b.get('kv', 'favorites')).toEqual(['c:mine', 'c:dal']);
  });
});

describe('atomicity', () => {
  it('a failure mid-commit leaves current data untouched', async () => {
    const doc = await plainArchive();
    const v = await validateArchive(textBlob(JSON.stringify(doc)));
    if (!v.ok) throw new Error(v.errors.join());

    const b = await freshDb();
    await b.put('entries', entry('keep-me', '2024-02-02'));
    await b.put('kv', { ...DEFAULT_SETTINGS, ageBand: 'under18' }, 'settings');
    const before = await snapshot(b);

    // Corrupt the staged data after validation: the second write lacks its key and fails
    // after the stores were already cleared inside the transaction.
    (v.staged.entries as unknown[]).splice(1, 0, { localDate: '2026-01-01' });
    await expect(commitRestore(b, v.staged, 'replace')).rejects.toThrow();
    expect(await snapshot(b)).toEqual(before);
    await expect(commitRestore(b, v.staged, 'merge')).rejects.toThrow();
    expect(await snapshot(b)).toEqual(before);
  });

  it('refuses staged data that did not come from validateArchive', async () => {
    const b = await freshDb();
    const fake: StagedRestore = { schemaVersion: 1, entries: [], foods: [], recipes: [], settings: null, favorites: null, water: null, images: [] };
    await expect(commitRestore(b, fake, 'replace')).rejects.toThrow(/not validated/);
  });
});

describe('water and goals', () => {
  it('merges water drinks by id and keeps existing ones', async () => {
    const a = await freshDb();
    await seed(a);
    const v = await validateArchive(await exportArchive(a, { includePhotos: false }));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const b = await freshDb();
    await b.put('kv', [{ id: 'w9', localDate: '2026-10-02', ml: 500, at: '2026-10-02T08:00:00.000Z' }], 'water');
    await commitRestore(b, v.staged, 'merge');
    expect(((await b.get('kv', 'water')) as { id: string }[]).map((w) => w.id).sort()).toEqual(['w1', 'w9']);
  });

  it('rejects implausible water amounts and goals', async () => {
    const a = await plainArchive(false);
    a.data.kv.water = [{ id: 'w1', localDate: '2026-10-01', ml: 99999, at: '2026-10-01T08:00:00.000Z' }];
    await expectRejected(await rehash(a), /water/);
    const b = await plainArchive(false);
    b.data.kv.settings = { ...b.data.kv.settings, goals: { energy_kcal: -5, protein_g: null, carb_g: null, fat_g: null, water_ml: 2000 } };
    await expectRejected(await rehash(b), /goals/);
  });

  it('accepts backups made before water tracking existed', async () => {
    const a = await plainArchive(false);
    delete a.data.kv.water;
    const v = await validateArchive(await rehash(a));
    expect(v.ok).toBe(true);
  });
});
