// Service worker registration + update notification. Production builds only.
// Relative URL + default scope => works under any subpath (e.g. GitHub Pages /My_CalAI/).

type Listener = (ready: boolean) => void;
const listeners = new Set<Listener>();
let waiting: ServiceWorker | null = null;

function setWaiting(w: ServiceWorker | null) {
  waiting = w;
  listeners.forEach((l) => l(w !== null));
}

/** Subscribe to "update ready" state. Returns an unsubscribe function. */
export function onUpdateReady(l: Listener): () => void {
  listeners.add(l);
  l(waiting !== null);
  return () => {
    listeners.delete(l);
  };
}

/** Activate the waiting worker; the page reloads once the new worker takes control. */
export function applyUpdate(): void {
  waiting?.postMessage('SKIP_WAITING');
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const track = (w: ServiceWorker | null) => {
          if (!w) return;
          w.addEventListener('statechange', () => {
            // Only prompt when an older worker already controls the page (not first install).
            if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w);
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => track(reg.installing));
        // Check for a new version each time the app returns to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch((e) => console.warn('Service worker registration failed', e));

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (waiting === null || reloading) return; // first-install claim: no reload
      reloading = true;
      location.reload();
    });
  });
}
