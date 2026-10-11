import { useEffect, useState } from 'preact/hooks';
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
      <div class="stack model-dl" aria-live="polite">
        <label for="model-progress"><strong>Downloading the suggestion model</strong></label>
        <progress id="model-progress" max={st.total} value={st.loaded}>{pct}%</progress>
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
          <Icon name="alert" size={16} /> Couldn't finish downloading: {failed} Verified files are kept so a retry continues where it stopped.
        </p>
      ) : null}
      {missing ? (
        <p class="notice warn">
          <Icon name="info" size={18} />
          <span>The suggestion model is no longer on this device. iPhone can remove website data when storage is low. Logging and photos still work.</span>
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
          <h3 id="dl-h">Download {sizeText}?</h3>
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
