import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';

/**
 * Full-screen meal camera: live viewfinder, shutter, photo library, and a switch to barcode.
 * The frame is drawn to a canvas locally (no EXIF, no location) and handed back as a JPEG Blob.
 * Nothing is uploaded.
 */
export function CameraCapture(props: { onCapture(photo: Blob): void; onLibrary(file: File): void; onBarcode(): void; onClose(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    closeRef.current?.focus();
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('This browser cannot open the camera here. Choose a photo from your library instead.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
          setReady(true);
        }
      } catch (e) {
        const name = (e as DOMException).name;
        setErr(
          name === 'NotAllowedError'
            ? 'Camera access is off for Thali. Allow it in iPhone Settings › Safari › Camera, or choose a photo from your library.'
            : 'The camera could not start. You can choose a photo from your library instead.',
        );
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(
      (b) => {
        setBusy(false);
        if (!b) return setErr('Could not take the photo. Try again.');
        stream.current?.getTracks().forEach((t) => t.stop());
        props.onCapture(b);
      },
      'image/jpeg',
      0.85,
    );
  }

  return (
    <div class="camera" role="dialog" aria-modal="true" aria-label="Meal camera">
      <video ref={video} class="cam-video" playsInline muted autoPlay aria-hidden="true" />
      <div class="cam-top">
        <button ref={closeRef} type="button" class="cam-round" onClick={props.onClose} aria-label="Close camera">
          <Icon name="close" />
        </button>
        <span class="cam-note"><Icon name="lock" size={14} /> Photo stays on this device</span>
        <button type="button" class="cam-pill" onClick={props.onBarcode}>
          <Icon name="barcode" size={18} /> Barcode
        </button>
      </div>
      {ready && !err ? <div class="cam-frame" aria-hidden="true" /> : null}
      {err ? <p class="cam-err" role="alert">{err}</p> : !ready ? <p class="cam-err" aria-busy="true">Starting camera…</p> : null}
      <div class="cam-bottom">
        <label class="cam-round cam-lib">
          <Icon name="image" />
          <span class="sr-only">Choose a photo from your library</span>
          <input
            type="file"
            accept="image/*"
            class="sr-only-input"
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) {
                stream.current?.getTracks().forEach((t) => t.stop());
                props.onLibrary(f);
              }
            }}
          />
        </label>
        <button type="button" class="shutter" onClick={shoot} disabled={!ready || busy} aria-label="Take photo">
          <span />
        </button>
        <span class="cam-spacer" aria-hidden="true" />
      </div>
    </div>
  );
}
