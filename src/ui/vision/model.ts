// App-wide state for the optional on-device photo suggestion model. A module singleton so a
// download keeps running while the user moves between screens.
import { useEffect, useState } from 'preact/hooks';
import { downloadModel, DownloadError, isInstalled, removeModel, totalBytes, type ModelManifest } from '../../vision/download';
import { resetRecognizer } from './suggest';

export type ModelStatus =
  | { kind: 'checking' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'absent' } // not downloaded (or removed / evicted)
  | { kind: 'downloading'; loaded: number; total: number }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

export interface ModelDeps {
  manifest(): ModelManifest;
  installed(m: ModelManifest): Promise<boolean>;
  download: typeof downloadModel;
  remove: typeof removeModel;
  supported(): string | null; // null = supported, else reason
}

// Smallest module using a SIMD instruction (v128). The runtime needs WebAssembly SIMD
// (Safari 16.4+), so older iOS must never download 90 MB it cannot run.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

export const defaultSupported = () => {
  if (typeof WebAssembly === 'undefined') return 'This browser cannot run the suggestion engine (no WebAssembly).';
  try {
    if (!WebAssembly.validate(SIMD_PROBE)) return 'It needs a newer browser (iOS 16.4 or later).';
  } catch {
    return 'It needs a newer browser (iOS 16.4 or later).';
  }
  if (typeof caches === 'undefined') return 'This browser cannot store files for offline use.';
  if (typeof Worker === 'undefined') return 'This browser cannot run background work.';
  return null;
};

let deps: ModelDeps | null = null;
let status: ModelStatus = { kind: 'checking' };
let abort: AbortController | null = null;
const subs = new Set<(s: ModelStatus) => void>();
const set = (s: ModelStatus) => {
  status = s;
  subs.forEach((f) => f(s));
};

async function getDeps(): Promise<ModelDeps> {
  if (deps) return deps;
  // Lazy: keeps the recognizer (and its label data) out of the startup bundle.
  const { modelManifest } = await import('../../vision/recognizer');
  deps = { manifest: modelManifest, installed: (m) => isInstalled(m), download: downloadModel, remove: removeModel, supported: defaultSupported };
  return deps;
}

/** Tests inject fakes here. */
export function setModelDeps(d: ModelDeps) {
  deps = d;
  status = { kind: 'checking' };
}

export async function refreshModelStatus(): Promise<ModelStatus> {
  if (status.kind === 'downloading') return status;
  const d = await getDeps();
  const why = d.supported();
  if (why) set({ kind: 'unsupported', reason: why });
  else set((await d.installed(d.manifest())) ? { kind: 'ready' } : { kind: 'absent' });
  return status;
}

export async function modelDownloadBytes(): Promise<number> {
  return totalBytes((await getDeps()).manifest());
}

export async function startModelDownload(): Promise<void> {
  if (status.kind === 'downloading') return;
  // Create the controller before any await so an immediate Cancel is never lost.
  const ac = new AbortController();
  abort = ac;
  set({ kind: 'downloading', loaded: 0, total: 0 });
  try {
    const d = await getDeps();
    const m = d.manifest();
    if (ac.signal.aborted) throw new DownloadError('aborted', 'Download cancelled.');
    set({ kind: 'downloading', loaded: 0, total: totalBytes(m) });
    await d.download(m, { signal: ac.signal, onProgress: (p) => set({ kind: 'downloading', loaded: p.loaded, total: p.total }) });
    set({ kind: 'ready' });
  } catch (e) {
    if (e instanceof DownloadError && e.code === 'aborted') set({ kind: 'absent' });
    else set({ kind: 'failed', message: (e as Error).message });
  } finally {
    abort = null;
  }
}

export function cancelModelDownload() {
  abort?.abort();
}

export async function removeModelFiles(): Promise<void> {
  cancelModelDownload();
  const d = await getDeps();
  await d.remove(d.manifest());
  await resetRecognizer();
  set({ kind: 'absent' });
}

export function useModelStatus(): ModelStatus {
  const [s, setS] = useState(status);
  useEffect(() => {
    subs.add(setS);
    if (status.kind === 'checking') void refreshModelStatus();
    return () => {
      subs.delete(setS);
    };
  }, []);
  return s;
}

export const formatMB = (b: number) => `${Math.round(b / 1e6)} MB`;
