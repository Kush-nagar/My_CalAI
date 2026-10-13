// Opt-in model download into a dedicated Cache Storage bucket.
// Invariants:
//  - Nothing is fetched until the user starts it (callers only).
//  - A model is "installed" only when every file is present with the pinned size and SHA-256.
//  - The cache name does NOT start with "thali-": the service worker deletes those on update.
//  - Only model files are requested; no user data is ever sent.

export interface ModelFile {
  /** Path inside the model repo, e.g. "onnx/vision_model_quantized.onnx". */
  path: string;
  url: string;
  bytes: number;
  sha256: string; // lowercase hex
}

export interface ModelManifest {
  id: string;
  revision: string;
  files: ModelFile[];
}

export const totalBytes = (m: ModelManifest) => m.files.reduce((s, f) => s + f.bytes, 0);
export const cacheName = (m: ModelManifest) => `model-cache:${m.id}@${m.revision}`;

export interface Progress {
  loaded: number;
  total: number;
  file: string;
}

export class DownloadError extends Error {
  constructor(
    public code: 'aborted' | 'network' | 'http' | 'size' | 'checksum' | 'storage',
    message: string,
  ) {
    super(message);
  }
}

export interface Deps {
  fetch: typeof fetch;
  caches: CacheStorage;
  digest(data: ArrayBuffer): Promise<string>;
}

export const browserDeps = (): Deps => ({
  fetch: (...a) => fetch(...a),
  caches: globalThis.caches,
  digest: sha256Hex,
});

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when every file is cached. Cheap check (no hashing) used at startup and before inference. */
export async function isInstalled(m: ModelManifest, deps: Pick<Deps, 'caches'> = browserDeps()): Promise<boolean> {
  if (!deps.caches) return false;
  try {
    if (!(await deps.caches.has(cacheName(m)))) return false;
    const c = await deps.caches.open(cacheName(m));
    for (const f of m.files) if (!(await c.match(f.url))) return false;
    return true;
  } catch {
    return false;
  }
}

export async function removeModel(m: ModelManifest, deps: Pick<Deps, 'caches'> = browserDeps()): Promise<void> {
  if (!deps.caches) return;
  // Remove every revision of this model, not just the current one.
  for (const k of await deps.caches.keys()) if (k.startsWith(`model-cache:${m.id}@`)) await deps.caches.delete(k);
}

/**
 * Download all files, verifying size and SHA-256 before each file is stored.
 * Already-cached files are skipped, so a cancelled or interrupted download resumes per file.
 */
export async function downloadModel(
  m: ModelManifest,
  opts: { signal?: AbortSignal; onProgress?(p: Progress): void },
  deps: Deps = browserDeps(),
): Promise<void> {
  if (!deps.caches) throw new DownloadError('storage', 'This browser cannot store files for offline use.');
  const total = totalBytes(m);
  let done = 0;
  // Drop other revisions (older model/runtime) so updates never leave orphaned copies behind.
  for (const k of await deps.caches.keys()) if (k.startsWith(`model-cache:${m.id}@`) && k !== cacheName(m)) await deps.caches.delete(k);
  const cache = await deps.caches.open(cacheName(m));
  for (const f of m.files) {
    if (await cache.match(f.url)) {
      done += f.bytes;
      opts.onProgress?.({ loaded: done, total, file: f.path });
      continue;
    }
    let res: Response;
    try {
      res = await deps.fetch(f.url, { signal: opts.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    } catch (e) {
      if (opts.signal?.aborted) throw new DownloadError('aborted', 'Download cancelled.');
      throw new DownloadError('network', `Network error while downloading ${f.path}.`);
    }
    if (!res.ok || !res.body) throw new DownloadError('http', `Server returned ${res.status} for ${f.path}.`);
    // Size is known: write chunks straight into one buffer (one copy of the file in memory).
    const buf = new Uint8Array(f.bytes);
    let got = 0;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        if (got + value.byteLength > f.bytes) throw new DownloadError('size', `${f.path} is larger than expected.`);
        buf.set(value, got);
        got += value.byteLength;
        opts.onProgress?.({ loaded: done + got, total, file: f.path });
      }
    } catch (e) {
      if (e instanceof DownloadError) throw e;
      if (opts.signal?.aborted) throw new DownloadError('aborted', 'Download cancelled.');
      throw new DownloadError('network', `Connection lost while downloading ${f.path}.`);
    }
    if (got !== f.bytes) throw new DownloadError('size', `${f.path} is incomplete (${got} of ${f.bytes} bytes).`);
    if ((await deps.digest(buf.buffer)) !== f.sha256) throw new DownloadError('checksum', `${f.path} failed its integrity check.`);
    if (opts.signal?.aborted) throw new DownloadError('aborted', 'Download cancelled.');
    try {
      await cache.put(f.url, new Response(buf, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(got) } }));
    } catch {
      throw new DownloadError('storage', 'Not enough storage space on this device.');
    }
    done += f.bytes;
  }
}
