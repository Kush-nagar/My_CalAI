/// <reference lib="webworker" />
// Runs the SigLIP2 image encoder off the main thread. Reads the model and ORT WASM bytes from the
// opt-in model cache only: this worker makes no network requests.
import * as ort from 'onnxruntime-web/webgpu';

export type WorkerIn =
  | { type: 'load'; cacheName: string; modelUrl: string; wasmUrl: string; preferGpu: boolean }
  | { type: 'embed'; id: number; inputs: Float32Array[]; size: number };
export type WorkerOut =
  | { type: 'loaded'; backend: 'webgpu' | 'wasm' }
  | { type: 'embedded'; id: number; embeddings: Float32Array[] }
  | { type: 'error'; id?: number; code: 'missing' | 'load' | 'run'; message: string };

let session: ort.InferenceSession | null = null;
const post = (m: WorkerOut, t?: Transferable[]) => (self as unknown as Worker).postMessage(m, t ?? []);

async function bytes(cache: Cache, url: string): Promise<ArrayBuffer> {
  const r = await cache.match(url);
  if (!r) throw Object.assign(new Error('Model files are not on this device'), { code: 'missing' });
  return r.arrayBuffer();
}

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  if (m.type === 'load') {
    try {
      const cache = await caches.open(m.cacheName);
      const [wasm, model] = await Promise.all([bytes(cache, m.wasmUrl), bytes(cache, m.modelUrl)]);
      ort.env.wasm.numThreads = 1; // GitHub Pages cannot enable cross-origin isolation
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmBinary = wasm;
      let backend: 'webgpu' | 'wasm' = 'wasm';
      if (m.preferGpu && 'gpu' in navigator) {
        try {
          session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] });
          backend = 'webgpu';
        } catch {
          session = null;
        }
      }
      session ??= await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
      post({ type: 'loaded', backend });
    } catch (e) {
      const err = e as Error & { code?: string };
      post({ type: 'error', code: err.code === 'missing' ? 'missing' : 'load', message: err.message });
    }
    return;
  }
  if (m.type === 'embed') {
    try {
      if (!session) throw new Error('Model not loaded');
      const out: Float32Array[] = [];
      for (const data of m.inputs) {
        const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, m.size, m.size]) };
        const res = await session.run(feeds);
        const t = res['pooler_output'] ?? res[session.outputNames[session.outputNames.length - 1]];
        out.push(Float32Array.from(t.data as Float32Array));
      }
      post({ type: 'embedded', id: m.id, embeddings: out }, out.map((e) => e.buffer));
    } catch (e) {
      post({ type: 'error', id: m.id, code: 'run', message: (e as Error).message });
    }
  }
};
