import { beforeEach, describe, expect, it } from 'vitest';
import { DownloadError, type ModelManifest } from '../../vision/download';
import { cancelModelDownload, refreshModelStatus, removeModelFiles, setModelDeps, startModelDownload, type ModelDeps, type ModelStatus } from './model';

const manifest: ModelManifest = { id: 'm', revision: 'r', files: [{ path: 'a', url: 'https://x/a', bytes: 100, sha256: 'x' }] };

function fakeDeps(over: Partial<ModelDeps> = {}) {
  let installed = false;
  const d: ModelDeps = {
    manifest: () => manifest,
    installed: async () => installed,
    download: async (_m, opts) => {
      opts.onProgress?.({ loaded: 50, total: 100, file: 'a' });
      installed = true;
    },
    remove: async () => {
      installed = false;
    },
    supported: () => null,
    ...over,
  };
  return d;
}

describe('photo suggestion model state', () => {
  let last: ModelStatus;
  beforeEach(() => {
    last = { kind: 'checking' };
  });

  it('starts absent (disabled / not downloaded) and never downloads by itself', async () => {
    let calls = 0;
    setModelDeps(fakeDeps({ download: async () => { calls++; } }));
    last = await refreshModelStatus();
    expect(last.kind).toBe('absent');
    expect(calls).toBe(0);
  });

  it('reports unsupported browsers', async () => {
    setModelDeps(fakeDeps({ supported: () => 'No WebAssembly.' }));
    expect((await refreshModelStatus()).kind).toBe('unsupported');
  });

  it('download → ready → remove → absent', async () => {
    setModelDeps(fakeDeps());
    await startModelDownload();
    expect((await refreshModelStatus()).kind).toBe('ready');
    await removeModelFiles();
    expect((await refreshModelStatus()).kind).toBe('absent');
  });

  it('cancel returns to absent; failures are reported, not thrown', async () => {
    setModelDeps(
      fakeDeps({
        download: (_m, o) =>
          new Promise((_, reject) => o.signal?.addEventListener('abort', () => reject(new DownloadError('aborted', 'x')))),
      }),
    );
    const p = startModelDownload();
    cancelModelDownload();
    await p;
    expect((await refreshModelStatus()).kind).toBe('absent');

    setModelDeps(fakeDeps({ download: async () => { throw new DownloadError('network', 'Connection lost.'); } }));
    await startModelDownload();
    // refresh does not mask a failure as ready
    expect((await refreshModelStatus()).kind).toBe('absent');
  });
});
