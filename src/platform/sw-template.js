/* Thali service worker. Generated into dist/sw.js by the swPrecache plugin in vite.config.ts.
 * Placeholders below are filled in at build time. Hand-written, no Workbox.
 *
 * Strategy
 *  - Precache every built file (incl. lazily imported seed chunk and the barcode WASM).
 *  - Same-origin precached asset: cache-first.
 *  - Navigation: network-first, falling back to the cached app shell (works offline).
 *  - Cross-origin requests (e.g. Open Food Facts) are never intercepted or cached.
 *  - New versions wait; the page asks to activate via postMessage('SKIP_WAITING').
 */
const VERSION = '__VERSION__';
const CACHE = 'thali-' + VERSION;
const PRECACHE = __PRECACHE__;
const scopeUrl = new URL(self.registration.scope);
const abs = (p) => new URL(p, scopeUrl).href;
const PRECACHE_URLS = PRECACHE.map(abs);
const SHELL = abs('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // cache: 'reload' bypasses the HTTP cache so a new version never precaches stale files.
      .then((c) => c.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('thali-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (Open Food Facts etc.)

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const c = await caches.open(CACHE);
            c.put(SHELL, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          const c = await caches.open(CACHE);
          return (await c.match(SHELL)) || (await c.match(scopeUrl.href)) || Response.error();
        }
      })(),
    );
    return;
  }

  const key = url.origin + url.pathname;
  if (PRECACHE_URLS.includes(key)) {
    event.respondWith(
      caches.open(CACHE).then(async (c) => (await c.match(key)) || fetch(req)),
    );
  }
  // Anything else same-origin: default network behaviour.
});
