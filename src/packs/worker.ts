/// <reference lib="webworker" />
// Holds installed food packs in memory and answers search/barcode queries off the main thread.
// Reads pack files from the device cache only; makes no network requests.
import { PackIndex, type PackRow } from './format';

export type PacksIn =
  | { type: 'load'; packs: { id: string; cacheName: string; urls: string[] }[] }
  | { type: 'search'; id: number; q: string; limit: number }
  | { type: 'barcode'; id: number; code: string };
export type PacksOut =
  | { type: 'loaded'; rows: number; missing: string[] }
  | { type: 'result'; id: number; rows: PackRow[] }
  | { type: 'error'; id?: number; message: string };

let index = new PackIndex();
const post = (m: PacksOut) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (ev: MessageEvent<PacksIn>) => {
  const m = ev.data;
  try {
    if (m.type === 'load') {
      index = new PackIndex();
      const missing: string[] = [];
      for (const p of m.packs) {
        const cache = await caches.open(p.cacheName);
        const texts: string[] = [];
        for (const u of p.urls) {
          const r = await cache.match(u);
          if (!r) break;
          texts.push(await r.text());
        }
        if (texts.length !== p.urls.length) {
          missing.push(p.id);
          continue;
        }
        for (const t of texts) index.addShard(p.id, t);
      }
      index.build();
      post({ type: 'loaded', rows: index.size, missing });
    } else if (m.type === 'search') {
      post({ type: 'result', id: m.id, rows: index.search(m.q, m.limit) });
    } else if (m.type === 'barcode') {
      const r = index.byBarcode(m.code);
      post({ type: 'result', id: m.id, rows: r ? [r] : [] });
    }
  } catch (e) {
    post({ type: 'error', id: 'id' in m ? m.id : undefined, message: (e as Error).message });
  }
};
