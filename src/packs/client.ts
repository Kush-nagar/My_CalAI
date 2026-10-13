// Main-thread side of offline food packs: manifest, opt-in download/removal, and queries.
import type { Ledger } from '../db/db';
import { downloadModel, isInstalled, removeModel, type ModelManifest, type Progress } from '../vision/download';
import { rowToFood, type PackInfo, type PackRow } from './format';
import type { PacksIn, PacksOut } from './worker';
import type { Food } from '../domain/types';

const abs = (p: string) => new URL(p, document.baseURI).href;

/** Download manifest for one pack. Revision changes whenever any file changes. */
export function packManifest(p: PackInfo): ModelManifest {
  return {
    id: `pack-${p.id}`,
    revision: `${p.version}-${p.files.map((f) => f.sha256.slice(0, 4)).join('')}`.slice(0, 64),
    files: p.files.map((f) => ({ path: f.path, url: abs(f.path), bytes: f.bytes, sha256: f.sha256 })),
  };
}
export const cacheNameFor = (p: PackInfo) => {
  const m = packManifest(p);
  return `model-cache:${m.id}@${m.revision}`;
};

/** Packs offered by this deployment (same-origin file; precached so it also works offline). */
export async function fetchAvailable(): Promise<PackInfo[]> {
  try {
    const r = await fetch(abs('packs/manifest.json'), { cache: 'no-cache' });
    if (!r.ok) return [];
    const j = (await r.json()) as { packs?: PackInfo[] };
    return Array.isArray(j.packs) ? j.packs : [];
  } catch {
    return [];
  }
}

export async function installedPacks(db: Ledger): Promise<PackInfo[]> {
  return ((await db.get('kv', 'packs')) as PackInfo[] | undefined) ?? [];
}

async function setInstalled(db: Ledger, list: PackInfo[]) {
  await db.put('kv', list, 'packs');
}

export async function installPack(db: Ledger, p: PackInfo, opts: { signal?: AbortSignal; onProgress?(p: Progress): void }) {
  await downloadModel(packManifest(p), opts);
  const cur = (await installedPacks(db)).filter((x) => x.id !== p.id);
  await setInstalled(db, [...cur, p]);
  resetWorker();
}

export async function removePack(db: Ledger, p: PackInfo) {
  await removeModel(packManifest(p));
  await setInstalled(db, (await installedPacks(db)).filter((x) => x.id !== p.id));
  resetWorker();
}

export async function packPresent(p: PackInfo): Promise<boolean> {
  return isInstalled(packManifest(p));
}

// ---- worker ---------------------------------------------------------------------------------

let worker: Worker | null = null;
let loaded: Promise<{ rows: number; missing: string[] }> | null = null;
let seq = 0;
const pending = new Map<number, (rows: PackRow[]) => void>();

function resetWorker() {
  worker?.terminate();
  worker = null;
  loaded = null;
  for (const r of pending.values()) r([]);
  pending.clear();
}

async function ensure(db: Ledger) {
  if (loaded) return loaded;
  const packs = await installedPacks(db);
  if (!packs.length) return (loaded = Promise.resolve({ rows: 0, missing: [] }));
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker = w;
  loaded = new Promise((resolve) => {
    w.onmessage = (ev: MessageEvent<PacksOut>) => {
      const m = ev.data;
      if (m.type === 'loaded') resolve({ rows: m.rows, missing: m.missing });
      else if (m.type === 'result') {
        pending.get(m.id)?.(m.rows);
        pending.delete(m.id);
      } else if (m.type === 'error') {
        if (m.id !== undefined) {
          pending.get(m.id)?.([]);
          pending.delete(m.id);
        } else resolve({ rows: 0, missing: packs.map((p) => p.id) });
      }
    };
    w.onerror = () => resolve({ rows: 0, missing: packs.map((p) => p.id) });
    const msg: PacksIn = { type: 'load', packs: packs.map((p) => ({ id: p.id, cacheName: cacheNameFor(p), urls: packManifest(p).files.map((f) => f.url) })) };
    w.postMessage(msg);
  });
  return loaded;
}

type Query = { type: 'search'; q: string; limit: number } | { type: 'barcode'; code: string };
function ask(msg: Query): Promise<PackRow[]> {
  if (!worker) return Promise.resolve([]);
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ ...msg, id } as PacksIn);
  });
}

/** Search installed packs. Resolves to [] when none are installed or they were removed by the system. */
export async function searchPacks(db: Ledger, q: string, limit = 30): Promise<Food[]> {
  const s = await ensure(db);
  if (!s.rows || !q.trim()) return [];
  return (await ask({ type: 'search', q, limit })).map(rowToFood);
}

export async function packBarcode(db: Ledger, code: string): Promise<Food | null> {
  const s = await ensure(db);
  if (!s.rows) return null;
  const [r] = await ask({ type: 'barcode', code });
  return r ? rowToFood(r) : null;
}

/** Status for the UI: how many products are searchable, and which installed packs went missing. */
export async function packsStatus(db: Ledger) {
  return ensure(db);
}
