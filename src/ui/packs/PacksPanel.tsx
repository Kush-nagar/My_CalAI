import { useEffect, useState } from 'preact/hooks';
import { DownloadError } from '../../vision/download';
import type { PackInfo } from '../../packs/format';
import { fetchAvailable, installPack, installedPacks, packPresent, removePack } from '../../packs/client';
import { Icon } from '../icons';
import { useApp } from '../store';
import { useUi } from '../ui';

type St = { kind: 'idle' } | { kind: 'downloading'; loaded: number; total: number; abort: AbortController } | { kind: 'error'; msg: string };
const MB = (b: number) => `${Math.max(1, Math.round(b / 1e6))} MB`;
const size = (p: PackInfo) => p.files.reduce((s, f) => s + f.bytes, 0);

/** Optional offline food databases: download once, then search and scan barcodes offline. */
export function PacksPanel() {
  const { state } = useApp();
  const ui = useUi();
  const [avail, setAvail] = useState<PackInfo[] | null>(null);
  const [installed, setInstalled] = useState<Record<string, 'yes' | 'missing'>>({});
  const [st, setSt] = useState<Record<string, St>>({});

  async function refresh() {
    const [a, inst] = await Promise.all([fetchAvailable(), installedPacks(state.db)]);
    const all = [...a, ...inst.filter((i) => !a.some((x) => x.id === i.id))];
    setAvail(all);
    const map: Record<string, 'yes' | 'missing'> = {};
    for (const p of inst) map[p.id] = (await packPresent(p)) ? 'yes' : 'missing';
    // An installed pack may be older than the one this deployment offers.
    for (const p of a) if (map[p.id] && !(await packPresent(p))) map[p.id] = 'missing';
    setInstalled(map);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function download(p: PackInfo) {
    const abort = new AbortController();
    const total = size(p);
    setSt((s) => ({ ...s, [p.id]: { kind: 'downloading', loaded: 0, total, abort } }));
    ui.announce(`Downloading ${p.name}`);
    let milestone = 0;
    try {
      await installPack(state.db, p, {
        signal: abort.signal,
        onProgress: (x) => {
          setSt((s) => ({ ...s, [p.id]: { kind: 'downloading', loaded: x.loaded, total: x.total, abort } }));
          const q = Math.floor((x.loaded / x.total) * 4);
          if (q > milestone && q < 4) ui.announce(`${q * 25}% downloaded`);
          milestone = Math.max(milestone, q);
        },
      });
      setSt((s) => ({ ...s, [p.id]: { kind: 'idle' } }));
      ui.announce(`${p.name} is ready`);
    } catch (e) {
      const cancelled = e instanceof DownloadError && e.code === 'aborted';
      setSt((s) => ({ ...s, [p.id]: cancelled ? { kind: 'idle' } : { kind: 'error', msg: (e as Error).message } }));
      if (cancelled) ui.announce('Download cancelled');
    }
    await refresh();
  }

  async function remove(p: PackInfo) {
    await removePack(state.db, p);
    ui.announce(`${p.name} removed`);
    await refresh();
  }

  if (avail === null) return <p class="hint" aria-busy="true">Checking…</p>;
  if (!avail.length)
    return <p class="hint">No downloadable food databases in this version. Connect to the internet and reopen Settings to check again.</p>;

  return (
    <div class="stack">
      <p class="hint">
        Optional extra databases you download once. After that they're searchable and their barcodes work offline. Files come from
        this app's own website; nothing about you is sent.
      </p>
      {avail.map((p) => {
        const s = st[p.id] ?? { kind: 'idle' };
        const inst = installed[p.id];
        return (
          <div class="card-inner stack" key={p.id}>
            <h3>{p.name}</h3>
            <p class="small">{p.description}</p>
            <p class="hint num">
              {p.rows.toLocaleString()} products · {MB(size(p))} · {p.license}
            </p>
            {s.kind === 'downloading' ? (
              <>
                <progress max={s.total} value={s.loaded} aria-label={`Downloading ${p.name}`} />
                <p class="hint num">{MB(s.loaded)} of {MB(s.total)}. Keep Thali open.</p>
                <button type="button" class="btn btn-secondary" onClick={() => s.abort.abort()}>Cancel download</button>
              </>
            ) : inst === 'yes' ? (
              <div class="btn-row">
                <span class="chip"><Icon name="check" size={14} /> On this device</span>
                <button type="button" class="btn btn-secondary" onClick={() => void remove(p)}><Icon name="trash" size={18} /> Remove</button>
              </div>
            ) : (
              <>
                {inst === 'missing' ? <p class="notice warn"><Icon name="info" size={18} /> <span>This database needs downloading again (it was updated, or iPhone cleared website data).</span></p> : null}
                {s.kind === 'error' ? <p class="error" role="alert"><Icon name="alert" size={16} /> {s.msg} Finished parts are kept; retrying continues.</p> : null}
                <button type="button" class="btn btn-primary" onClick={() => void download(p)}>Download {MB(size(p))}</button>
              </>
            )}
            <p class="hint small">{p.attribution}</p>
          </div>
        );
      })}
    </div>
  );
}
