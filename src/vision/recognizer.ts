// Main-thread client for on-device photo suggestions. Owns the model manifest, the worker, and
// image cropping. Suggestions are labels we wrote, ranked; they are never saved automatically.
import assets from './assets.json';
import labelEmbeddings from './label-embeddings.json';
import { cacheName, isInstalled, type ModelManifest } from './download';
import { toPixelValues, type PreprocessSpec } from './preprocess';
import { makeScorer, mergeRankings, type Ranked } from './scoring';
import type { WorkerIn, WorkerOut } from './worker';

const abs = (p: string) => new URL(p, document.baseURI).href;

export function modelManifest(): ModelManifest {
  const model = assets.files.find((f) => f.path === 'vision_model_q4.onnx')!;
  return {
    id: assets.id,
    // Revision changes whenever the model or the runtime WASM changes, so stale files are never mixed.
    revision: `${assets.revision.slice(0, 12)}-${__ORT_WASM__.sha256.slice(0, 10)}`,
    files: [
      { path: 'vision_model_q4.onnx', url: abs('models/siglip2-b16-224/vision_model_q4.onnx'), bytes: model.bytes, sha256: model.sha256 },
      { path: __ORT_WASM__.path, url: abs(__ORT_WASM__.path), bytes: __ORT_WASM__.bytes, sha256: __ORT_WASM__.sha256 },
    ],
  };
}

export const SPEC: PreprocessSpec = assets.preprocess;
const scorer = makeScorer(labelEmbeddings, assets.logitScale, assets.logitBias);

export class RecognizerError extends Error {
  constructor(public code: 'missing' | 'load' | 'run' | 'image' | 'cancelled', message: string) {
    super(message);
  }
}

/** Resize a region of the photo to the model's square input (SigLIP squashes; no crop). */
async function regionPixels(bmp: ImageBitmap, sx: number, sy: number, sw: number, sh: number): Promise<Float32Array> {
  const { width: w, height: h } = SPEC.size;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  return toPixelValues(ctx.getImageData(0, 0, w, h).data, w, h, SPEC);
}

/** Whole photo, plus four overlapping quarters for mixed plates / thalis when asked. */
export async function photoInputs(photo: Blob, parts: boolean): Promise<Float32Array[]> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(photo);
  } catch {
    throw new RecognizerError('image', 'This photo could not be read.');
  }
  try {
    const { width: W, height: H } = bmp;
    const out = [await regionPixels(bmp, 0, 0, W, H)];
    if (parts) {
      const cw = W * 0.6;
      const ch = H * 0.6;
      for (const [x, y] of [[0, 0], [W - cw, 0], [0, H - ch], [W - cw, H - ch]]) out.push(await regionPixels(bmp, x, y, cw, ch));
    }
    return out;
  } finally {
    bmp.close();
  }
}

export class Recognizer {
  private worker: Worker | null = null;
  private loaded: Promise<'webgpu' | 'wasm'> | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve(e: Float32Array[]): void; reject(e: Error): void }>();
  private rejectLoad: ((e: Error) => void) | null = null;

  constructor(private manifest = modelManifest()) {}

  installed(): Promise<boolean> {
    return isInstalled(this.manifest);
  }

  private start(): Worker {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      if (m.type === 'embedded') {
        this.pending.get(m.id)?.resolve(m.embeddings);
        this.pending.delete(m.id);
      } else if (m.type === 'error' && m.id !== undefined) {
        this.pending.get(m.id)?.reject(new RecognizerError('run', m.message));
        this.pending.delete(m.id);
      }
    };
    w.onerror = () => this.fail(new RecognizerError('load', 'The suggestion engine stopped unexpectedly.'));
    return w;
  }

  private fail(e: RecognizerError) {
    this.rejectLoad?.(e);
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.loaded = null;
  }

  /** Load the model from the device cache. Never downloads. */
  load(): Promise<'webgpu' | 'wasm'> {
    if (this.loaded) return this.loaded;
    this.worker = this.start();
    const w = this.worker;
    const [model, wasm] = this.manifest.files;
    this.loaded = new Promise((resolve, reject) => {
      this.rejectLoad = reject;
      const onMsg = (ev: MessageEvent<WorkerOut>) => {
        const m = ev.data;
        if (m.type === 'loaded') resolve(m.backend);
        else if (m.type === 'error' && m.id === undefined) this.fail(new RecognizerError(m.code === 'missing' ? 'missing' : 'load', m.message));
        else return;
        w.removeEventListener('message', onMsg);
      };
      w.addEventListener('message', onMsg);
      const msg: WorkerIn = { type: 'load', cacheName: cacheName(this.manifest), modelUrl: model.url, wasmUrl: wasm.url, preferGpu: true };
      w.postMessage(msg);
    });
    return this.loaded;
  }

  async embed(inputs: Float32Array[]): Promise<Float32Array[]> {
    await this.load();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: WorkerIn = { type: 'embed', id, inputs, size: SPEC.size.width };
      this.worker!.postMessage(msg, inputs.map((i) => i.buffer));
    });
  }

  /** Ranked label suggestions for a photo. */
  async suggest(photo: Blob, opts: { parts?: boolean } = {}): Promise<Ranked[]> {
    const inputs = await photoInputs(photo, !!opts.parts);
    const embeddings = await this.embed(inputs);
    return mergeRankings(embeddings.map((e) => scorer.rank(e, 8)), 6);
  }

  /** Stop any running work and free memory. */
  cancel() {
    this.fail(new RecognizerError('cancelled', 'Cancelled.'));
  }
}
