import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';
import { useApp } from '../store';
import { useUi } from '../ui';
import {
  cancelModelDownload,
  formatMB,
  modelDownloadBytes,
  removeModelFiles,
  startModelDownload,
  useModelStatus,
} from './model';

/** Opt-in, download, progress/cancel, remove and "model missing" states for photo suggestions. */
export function ModelPanel() {
  const { state, actions } = useApp();
  const ui = useUi();
  const st = useModelStatus();
  const enabled = state.settings.photoSuggestions;
  const [size, setSize] = useState<number | null>(null);
  const [free, setFree] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const dlHeading = useRef<HTMLHeadingElement>(null);
  const progressRef = useRef<HTMLProgressElement>(null);
  const milestone = useRef(0);

  // Screen readers: announce progress at 25% steps, not on every chunk.
  useEffect(() => {
    if (st.kind !== 'downloading' || !st.total) {
      milestone.current = 0;
      return;
    }
    const q = Math.floor((st.loaded / st.total) * 4);
    if (q > milestone.current && q < 4) ui.announce(`Download ${q * 25}% done`);
    milestone.current = Math.max(milestone.current, q);
  }, [st]);
  useEffect(() => {
    if (st.kind === 'ready' && milestone.current) ui.announce('Photo suggestions are ready');
  }, [st.kind]);
  useEffect(() => {
    if (confirming) dlHeading.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (st.kind === 'downloading') progressRef.current?.focus();
  }, [st.kind]);

  useEffect(() => {
    modelDownloadBytes().then(setSize, () => setSize(null));
    navigator.storage?.estimate?.().then(
      (e) => setFree(e.quota !== undefined && e.usage !== undefined ? e.quota - e.usage : null),
      () => setFree(null),
    );
  }, []);

  const sizeText = size ? formatMB(size) : 'about 90 MB';

  async function download() {
    setConfirming(false);
    await actions.updateSettings({ photoSuggestions: true });
    void navigator.storage?.persist?.().catch(() => false);
    ui.announce('Download started');
    await startModelDownload();
  }

  async function remove() {
    await removeModelFiles();
    await actions.updateSettings({ photoSuggestions: false });
    ui.announce('Suggestion model removed. Photos still work as memory aids.');
  }

  if (st.kind === 'checking') return <p class="hint" aria-busy="true">Checking…</p>;
  if (st.kind === 'unsupported') {
    return (
      <p class="notice">
        <Icon name="info" size={18} /> <span>Photo suggestions aren't available on this browser. {st.reason} Photos still work as memory aids.</span>
      </p>
    );
  }

  if (st.kind === 'downloading') {
    const pct = st.total ? Math.floor((st.loaded / st.total) * 100) : 0;
    return (
      <div class="stack model-dl">
        <label for="model-progress"><strong>Downloading the suggestion model</strong></label>
        <progress id="model-progress" ref={progressRef} tabIndex={-1} max={st.total} value={st.loaded}>{pct}%</progress>
        <p class="hint num">
          {formatMB(st.loaded)} of {formatMB(st.total)} ({pct}%). Keep Thali open until it finishes. You can keep logging meanwhile.
        </p>
        <button type="button" class="btn btn-secondary" onClick={() => {
            cancelModelDownload();
            void actions.updateSettings({ photoSuggestions: false });
            ui.announce('Download cancelled');
          }}>
          Cancel download
        </button>
      </div>
    );
  }

  if (st.kind === 'ready' && !enabled) {
    return (
      <div class="stack">
        <p class="notice">
          <Icon name="info" size={18} />
          <span>The suggestion model ({sizeText}) is on this device but photo suggestions are turned off.</span>
        </p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" onClick={() => void actions.updateSettings({ photoSuggestions: true })}>Turn on</button>
          <button type="button" class="btn btn-secondary" onClick={() => void remove()}><Icon name="trash" size={18} /> Remove model</button>
        </div>
      </div>
    );
  }

  if (st.kind === 'ready') {
    return (
      <div class="stack">
        <p class="notice">
          <Icon name="check" size={18} />
          <span>Photo suggestions are ready and work offline. The model ({sizeText}) is stored on this device. Your photos are looked at on this device only.</span>
        </p>
        <button type="button" class="btn btn-secondary" onClick={() => void remove()}>
          <Icon name="trash" size={18} /> Remove model
        </button>
      </div>
    );
  }

  const failed = st.kind === 'failed' ? st.message : null;
  const missing = enabled && !failed; // user opted in earlier, files are gone (removed by iOS or cleared)

  return (
    <div class="stack">
      {failed ? (
        <p class="error" role="alert">
          <Icon name="alert" size={16} /> Couldn't finish downloading: {failed} Files that finished downloading are kept; the rest starts again when you retry.
        </p>
      ) : null}
      {missing ? (
        <p class="notice warn">
          <Icon name="info" size={18} />
          <span>
            The suggestion model isn't fully on this device. This happens after an app update, an unfinished download, restoring a
            backup on another phone, or when iPhone clears website data. Logging and photos still work.
          </span>
        </p>
      ) : null}
      {!confirming ? (
        <>
          <p>
            Optional. Thali can suggest possible food names from a photo. It runs on this device; your photo is never uploaded.
          </p>
          <div class="btn-row">
            <button type="button" class="btn btn-primary" onClick={() => setConfirming(true)}>
              {failed ? 'Try again' : missing ? 'Download again' : 'Set up photo suggestions'}
            </button>
            {enabled ? (
              <button type="button" class="btn btn-secondary" onClick={() => void remove()}>Turn off</button>
            ) : null}
          </div>
        </>
      ) : (
        <div class="card-inner stack" role="group" aria-labelledby="dl-h">
          <h3 id="dl-h" ref={dlHeading} tabIndex={-1}>Download {sizeText}?</h3>
          <ul class="bullets">
            <li>One-time download of {sizeText}, stored on this device{free !== null ? ` (about ${formatMB(free)} available to this app)` : ''}. Wi-Fi recommended.</li>
            <li>The files come from this app's own website. Your photos and diary are never sent anywhere.</li>
            <li>After the download, suggestions work offline. You can remove the model at any time in Settings.</li>
            <li>It only suggests names of foods it can see. It does not know amounts, oil, sugar or hidden ingredients. You choose the food and the amount.</li>
          </ul>
          <div class="btn-row">
            <button type="button" class="btn btn-primary" onClick={() => void download()}>Download {sizeText}</button>
            <button type="button" class="btn btn-secondary" onClick={() => setConfirming(false)}>Not now</button>
          </div>
        </div>
      )}
    </div>
  );
}
