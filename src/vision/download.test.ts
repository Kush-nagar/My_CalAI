import { describe, expect, it } from 'vitest';
import { cacheName, downloadModel, DownloadError, isInstalled, removeModel, sha256Hex, type Deps, type ModelManifest } from './download';

/** Minimal in-memory CacheStorage. `failPut` simulates a full disk. */
export function memCaches(opts: { failPut?: boolean } = {}): CacheStorage {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const s = stores.get(name)!;
    return {
      match: async (k: RequestInfo | URL) => s.get(String(k))?.clone(),
      put: async (k: RequestInfo | URL, r: Response) => {
        if (opts.failPut) throw new DOMException('quota', 'QuotaExceededError');
        s.set(String(k), r);
      },
      delete: async (k: RequestInfo | URL) => s.delete(String(k)),
      keys: async () => [...s.keys()].map((k) => new Request(k)),
    } as unknown as Cache;
  };
  return {
    open,
    has: async (n: string) => stores.has(n),
    delete: async (n: string) => stores.delete(n),
    keys: async () => [...stores.keys()],
    match: async () => undefined,
  } as unknown as CacheStorage;
}

const enc = (s: string) => new TextEncoder().encode(s);
const A = enc('model-weights-aaaa');
const B = enc('tokenizer-bbbb');

async function manifest(): Promise<ModelManifest> {
  return {
    id: 'test/model',
    revision: 'abc123',
    files: [
      { path: 'a.onnx', url: 'https://example.test/a.onnx', bytes: A.byteLength, sha256: await sha256Hex(A.slice().buffer) },
      { path: 'b.json', url: 'https://example.test/b.json', bytes: B.byteLength, sha256: await sha256Hex(B.slice().buffer) },
    ],
  };
}

function fetcher(map: Record<string, Uint8Array | number | 'throw'>, calls: string[] = []): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(url));
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const v = map[String(url)];
    if (v === 'throw') throw new TypeError('network down');
    if (typeof v === 'number') return new Response('nope', { status: v });
    return new Response(v.slice());
  }) as typeof fetch;
}

const deps = (f: typeof fetch, caches = memCaches()): Deps => ({ fetch: f, caches, digest: sha256Hex });

describe('model download', () => {
  it('is not installed before any download', async () => {
    expect(await isInstalled(await manifest(), { caches: memCaches() })).toBe(false);
  });

  it('downloads, verifies and reports progress; then installed', async () => {
    const m = await manifest();
    const d = deps(fetcher({ [m.files[0].url]: A, [m.files[1].url]: B }));
    const seen: number[] = [];
    await downloadModel(m, { onProgress: (p) => seen.push(p.loaded) }, d);
    expect(seen.at(-1)).toBe(A.byteLength + B.byteLength);
    expect(await isInstalled(m, d)).toBe(true);
  });

  it('cancelled download leaves the model not installed and resumes per file', async () => {
    const m = await manifest();
    const ac = new AbortController();
    const calls: string[] = [];
    const caches = memCaches();
    // Abort after the first file finished.
    const d = deps(fetcher({ [m.files[0].url]: A, [m.files[1].url]: B }, calls), caches);
    const onProgress = (p: { file: string }) => { if (p.file === 'a.onnx') ac.abort(); };
    await expect(downloadModel(m, { signal: ac.signal, onProgress }, d)).rejects.toMatchObject({ code: 'aborted' });
    expect(await isInstalled(m, d)).toBe(false);
    calls.length = 0;
    await downloadModel(m, {}, d);
    expect(calls).toEqual([m.files[1].url]); // first file not re-downloaded
    expect(await isInstalled(m, d)).toBe(true);
  });

  it('fails cleanly on network, HTTP, size and checksum problems', async () => {
    const m = await manifest();
    await expect(downloadModel(m, {}, deps(fetcher({ [m.files[0].url]: 'throw' })))).rejects.toMatchObject({ code: 'network' });
    await expect(downloadModel(m, {}, deps(fetcher({ [m.files[0].url]: 404 })))).rejects.toMatchObject({ code: 'http' });
    await expect(downloadModel(m, {}, deps(fetcher({ [m.files[0].url]: enc('short') })))).rejects.toMatchObject({ code: 'size' });
    const tampered = enc('model-weights-XXXX');
    const c = memCaches();
    await expect(downloadModel(m, {}, deps(fetcher({ [m.files[0].url]: tampered }), c))).rejects.toMatchObject({ code: 'checksum' });
    expect(await isInstalled(m, { caches: c })).toBe(false);
  });

  it('reports a storage error when the device is full', async () => {
    const m = await manifest();
    const err = await downloadModel(m, {}, deps(fetcher({ [m.files[0].url]: A }), memCaches({ failPut: true }))).catch((e) => e);
    expect(err).toBeInstanceOf(DownloadError);
    expect(err.code).toBe('storage');
  });

  it('removal deletes every revision; eviction looks like not installed', async () => {
    const m = await manifest();
    const caches = memCaches();
    const d = deps(fetcher({ [m.files[0].url]: A, [m.files[1].url]: B }), caches);
    await downloadModel(m, {}, d);
    await caches.open('model-cache:test/model@older');
    await removeModel(m, d);
    expect(await caches.keys()).toEqual([]);
    expect(await isInstalled(m, d)).toBe(false);
    // Cache name must survive the service worker's cleanup of "thali-*" caches.
    expect(cacheName(m).startsWith('thali-')).toBe(false);
  });

  it('treats missing Cache Storage (unsupported/blocked) as unavailable', async () => {
    const m = await manifest();
    expect(await isInstalled(m, { caches: undefined as unknown as CacheStorage })).toBe(false);
    await expect(downloadModel(m, {}, { fetch: fetcher({}), caches: undefined as unknown as CacheStorage, digest: sha256Hex })).rejects.toMatchObject({ code: 'storage' });
  });
});
