import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../store';
import { putCustomFood } from '../../db/repo';
import { barcodeCandidates, isValidGtin } from '../../platform/gtin';
import { lookupOff, OffError, OFF_ATTRIBUTION, OFF_CAVEAT, type OffPreview } from '../../platform/off';
import type { Food } from '../../domain/types';

export type BarcodeSheetProps = Props;
type Props = {
  onFound(food: Food): void;
  onManualEntry(barcode: string): void;
  onClose(): void;
};

type Phase =
  | { t: 'intro' }
  | { t: 'starting' }
  | { t: 'scanning' }
  | { t: 'camera-error'; msg: string }
  | { t: 'code'; code: string }
  | { t: 'off-loading'; code: string }
  | { t: 'off-preview'; code: string; preview: OffPreview }
  | { t: 'off-error'; code: string; msg: string };

const wrap = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center';
const panel =
  'width:100%;max-width:520px;max-height:92vh;overflow:auto;background:var(--surface,#fff);color:var(--ink,#222620);border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));font:16px/1.4 system-ui,sans-serif';
const btn =
  'min-height:48px;padding:0 16px;border-radius:12px;border:1px solid var(--border,#E4E1D8);background:var(--surface,#fff);color:inherit;font:inherit';
const primary = 'min-height:48px;padding:0 16px;border-radius:12px;border:0;background:var(--forest,#315A45);color:#fff;font:inherit;font-weight:600';

export function BarcodeSheet({ onFound, onManualEntry, onClose }: Props) {
  const { state, actions } = useApp();
  const [phase, setPhase] = useState<Phase>({ t: 'intro' });
  const [manual, setManual] = useState('');
  const [manualErr, setManualErr] = useState('');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aliveRef = useRef(true);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopCamera();
    };
  }, []);

  /** Resolve a barcode: local custom foods first, never network. */
  async function handleCode(code: string) {
    stopCamera();
    for (const cand of barcodeCandidates(code)) {
      const hit = await state.db.getFromIndex('foods', 'barcode', cand);
      if (hit && !hit.archived) {
        onFound(hit);
        return;
      }
    }
    if (aliveRef.current) setPhase({ t: 'code', code });
  }

  async function startCamera() {
    setPhase({ t: 'starting' });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera access.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!aliveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setPhase({ t: 'scanning' });
    } catch (e) {
      const name = (e as Error)?.name;
      const msg =
        name === 'NotAllowedError'
          ? 'Camera permission was denied. You can allow it in your browser or iOS Settings, or type the barcode instead.'
          : name === 'NotFoundError'
            ? 'No camera was found. Type the barcode instead.'
            : 'Could not start the camera. Type the barcode instead.';
      if (aliveRef.current) setPhase({ t: 'camera-error', msg });
    }
  }

  // Attach the stream and run the scan loop while in the scanning phase.
  useEffect(() => {
    if (phase.t !== 'scanning') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
    let cancelled = false;
    let timer: number | undefined;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    (async () => {
      const { decodeFrame } = await import('../../platform/barcode-decoder'); // lazy: zxing + WASM
      const tick = async () => {
        if (cancelled || !ctx) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const scale = Math.min(1, 960 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const code = await decodeFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (code && isValidGtin(code) && !cancelled) {
              await handleCode(code);
              return;
            }
          } catch {
            // Decoder hiccup on a frame: keep scanning.
          }
        }
        if (!cancelled) timer = window.setTimeout(tick, 150);
      };
      void tick();
    })().catch(() => {
      if (!cancelled) {
        stopCamera();
        setPhase({ t: 'camera-error', msg: 'The barcode reader could not load. Type the barcode instead.' });
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.t]);

  async function submitManual(e: Event) {
    e.preventDefault();
    const code = manual.replace(/[\s-]/g, '');
    if (!/^\d+$/.test(code)) return setManualErr('Use digits only.');
    if (![8, 12, 13, 14].includes(code.length)) return setManualErr('Barcodes have 8, 12, 13 or 14 digits.');
    if (!isValidGtin(code)) return setManualErr('The last (check) digit does not match. Check the number and try again.');
    setManualErr('');
    await handleCode(code);
  }

  async function doLookup(code: string) {
    setPhase({ t: 'off-loading', code });
    try {
      const preview = await lookupOff(code);
      if (aliveRef.current) setPhase({ t: 'off-preview', code, preview });
    } catch (e) {
      const msg = e instanceof OffError ? e.message : 'Lookup failed.';
      if (aliveRef.current) setPhase({ t: 'off-error', code, msg });
    }
  }

  async function saveOff(preview: OffPreview) {
    setBusy(true);
    try {
      await putCustomFood(state.db, preview.food);
      await actions.refreshCatalog();
      onFound(preview.food);
    } catch (e) {
      setBusy(false);
      if (aliveRef.current) setPhase({ t: 'off-error', code: preview.food.barcode ?? '', msg: String((e as Error).message ?? e) });
    }
  }

  const close = () => {
    stopCamera();
    onClose();
  };

  const manualForm = (
    <form onSubmit={submitManual} style="display:grid;gap:8px;margin-top:16px">
      <label for="bc-manual" style="font-weight:600">Or type the barcode</label>
      <div style="display:flex;gap:8px">
        <input
          id="bc-manual"
          inputMode="numeric"
          autocomplete="off"
          placeholder="e.g. 8901058000290"
          value={manual}
          onInput={(e) => setManual((e.target as HTMLInputElement).value)}
          style="flex:1;min-height:48px;padding:0 12px;border-radius:12px;border:1px solid var(--border,#E4E1D8);font:inherit;background:var(--surface,#fff);color:inherit"
          aria-describedby="bc-manual-err"
        />
        <button type="submit" style={primary}>Use</button>
      </div>
      <div id="bc-manual-err" role="alert" style="color:var(--error,#A13D36);min-height:1em">{manualErr}</div>
    </form>
  );

  return (
    <div style={wrap} role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <div style={panel}>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h2 style="margin:0;font-size:20px">Scan a barcode</h2>
          <button type="button" onClick={close} style={btn} aria-label="Close barcode scanner">Close</button>
        </div>

        {(phase.t === 'intro' || phase.t === 'camera-error') && (
          <div>
            <p style="margin:0 0 12px">
              Thali needs your camera to read the barcode on a package. The picture is processed on this phone only and is
              never saved or sent anywhere.
            </p>
            {phase.t === 'camera-error' && (
              <p role="alert" style="color:var(--error,#A13D36)">{phase.msg}</p>
            )}
            <button type="button" style={primary} onClick={startCamera}>
              {phase.t === 'camera-error' ? 'Try the camera again' : 'Allow camera and scan'}
            </button>
            {manualForm}
          </div>
        )}

        {(phase.t === 'starting' || phase.t === 'scanning') && (
          <div>
            <div style="position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:4/3">
              <video ref={videoRef} playsInline muted autoplay style="width:100%;height:100%;object-fit:cover" />
              <div style="position:absolute;left:10%;right:10%;top:35%;bottom:35%;border:3px solid #D59432;border-radius:8px;pointer-events:none" />
            </div>
            <p role="status" style="margin:8px 0 0">
              {phase.t === 'starting' ? 'Starting camera…' : 'Point the camera at the barcode and hold steady.'}
            </p>
            {manualForm}
          </div>
        )}

        {phase.t === 'code' && (
          <CodeResult
            code={phase.code}
            lookupEnabled={state.settings.onlineLookup}
            onLookup={() => doLookup(phase.code)}
            onManual={() => onManualEntry(phase.code)}
            onRescan={() => setPhase({ t: 'intro' })}
          />
        )}

        {phase.t === 'off-loading' && <p role="status">Looking up {phase.code} on Open Food Facts…</p>}

        {phase.t === 'off-error' && (
          <div>
            <p role="alert">{phase.msg}</p>
            <div style="display:grid;gap:8px">
              <button type="button" style={btn} onClick={() => doLookup(phase.code)}>Try again</button>
              <button type="button" style={primary} onClick={() => onManualEntry(phase.code)}>Enter it myself</button>
            </div>
          </div>
        )}

        {phase.t === 'off-preview' && (
          <OffPreviewView preview={phase.preview} showKcal={state.settings.showCalories} busy={busy} onSave={() => saveOff(phase.preview)} onManual={() => onManualEntry(phase.code)} />
        )}
      </div>
    </div>
  );
}

function CodeResult(p: { code: string; lookupEnabled: boolean; onLookup(): void; onManual(): void; onRescan(): void }) {
  return (
    <div>
      <p style="margin:0 0 4px"><strong>Barcode {p.code}</strong></p>
      <p style="margin:0 0 12px">No saved food on this phone uses this barcode.</p>
      <div style="display:grid;gap:8px">
        {p.lookupEnabled && (
          <button type="button" style={primary} onClick={p.onLookup}>Look up on Open Food Facts</button>
        )}
        <button type="button" style={p.lookupEnabled ? btn : primary} onClick={p.onManual}>Enter nutrition from the label</button>
        <button type="button" style={btn} onClick={p.onRescan}>Scan another</button>
      </div>
      {p.lookupEnabled ? (
        <p style="margin:12px 0 0;font-size:14px;color:var(--secondary,#5F665E)">
          Looking up sends only this barcode number to Open Food Facts, and only when you tap the button.
        </p>
      ) : (
        <p style="margin:12px 0 0;font-size:14px;color:var(--secondary,#5F665E)">
          Tip: turn on "Online barcode lookup" in Settings to fetch packaged-food data from Open Food Facts. It is off by
          default and never runs on its own.
        </p>
      )}
    </div>
  );
}

function OffPreviewView({ preview, showKcal, busy, onSave, onManual }: { preview: OffPreview; showKcal: boolean; busy: boolean; onSave(): void; onManual(): void }) {
  const f = preview.food;
  const rows: [string, string][] = [];
  const add = (label: string, code: keyof Food['per100g'], unit: string) => {
    const v = f.per100g[code];
    rows.push([label, v && v.amount !== null ? `${v.amount} ${unit}` : 'not reported']);
  };
  if (showKcal) add('Energy', 'energy_kcal', 'kcal');
  add('Protein', 'protein_g', 'g');
  add('Carbohydrate', 'carb_g', 'g');
  add('Fat', 'fat_g', 'g');
  add('Fibre', 'fiber_g', 'g');
  add('Sodium', 'sodium_mg', 'mg');
  return (
    <div>
      <h3 style="margin:0">{f.name}</h3>
      {preview.quantity && <p style="margin:2px 0 8px">Package: {preview.quantity}</p>}
      <p style="margin:8px 0 4px;font-weight:600">Per 100 g (from the package label, as entered on Open Food Facts)</p>
      <table style="width:100%;border-collapse:collapse">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style="padding:4px 0">{k}</td>
              <td style="padding:4px 0;text-align:right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f.servings[0] && <p style="margin:8px 0">Serving on label: {f.servings[0].label}</p>}
      <p role="note" style="margin:8px 0;padding:8px 12px;border-radius:8px;background:var(--canvas,#F7F5EF);font-size:14px">
        {OFF_CAVEAT}
        {preview.warnings.map((w) => (
          <span key={w}><br />{w}</span>
        ))}
      </p>
      <p style="margin:8px 0;font-size:13px;color:var(--secondary,#5F665E)">{OFF_ATTRIBUTION}</p>
      <div style="display:grid;gap:8px">
        <button type="button" style={primary} disabled={busy} onClick={onSave}>Save as custom food</button>
        <button type="button" style={btn} onClick={onManual}>Enter it myself instead</button>
      </div>
    </div>
  );
}
