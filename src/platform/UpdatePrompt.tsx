import { useEffect, useState } from 'preact/hooks';
import { applyUpdate, onUpdateReady } from './sw-register';

/** Small non-blocking banner shown when a new app version is downloaded and waiting. */
export function UpdatePrompt() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => onUpdateReady(setReady), []);
  if (!ready || dismissed) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style="position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:1000;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:12px;background:#315A45;color:#F7F5EF;font:500 15px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)"
    >
      <span>Update available — reload</span>
      <span style="display:flex;gap:8px">
        <button type="button" onClick={() => setDismissed(true)} style="min-height:44px;min-width:44px;background:transparent;color:inherit;border:0;font:inherit">
          Later
        </button>
        <button type="button" onClick={applyUpdate} style="min-height:44px;padding:0 14px;border-radius:8px;border:0;background:#F7F5EF;color:#315A45;font:inherit;font-weight:600">
          Reload
        </button>
      </span>
    </div>
  );
}
