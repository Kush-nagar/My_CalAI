# Deploying Thali (static PWA, $0)

Thali is a static site: `npm run build` produces `dist/` with relative paths, so it works at the root of a
domain or under a subpath such as `https://<user>.github.io/My_CalAI/`. HTTPS is required for the service
worker, camera and "Add to Home Screen"; every host below provides it.

## Recommended: GitHub Pages via Actions

`.github/workflows/pages.yml` runs on every push to `main` (and manually via "Run workflow"):
`npm ci` → `npm test` → `npm run build` → upload `dist/` → deploy.

**One-time owner action:** repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

**Private repository caveat.** GitHub Pages for a *private* repository requires a paid GitHub plan
(Pro/Team/Enterprise). On the Free plan Pages only serves public repositories. Free routes:

1. **Make the repository public.** The repo holds code only; your diary lives in IndexedDB on your phone and is never
   committed. Check that no personal data, exports or `.env` files are ever committed first. Seed data licences are in
   `docs/LICENSES.md`.
2. **Separate public repo with built files only.** Keep this repo private; build locally (`npm run build`) and push the
   contents of `dist/` to a second, public repo (e.g. `thali-site`) with Pages serving from its `main` branch root. You
   repeat this for each release (`npm run package` makes a zip for this).

Neither route exposes user data, but a public URL means anyone can open the (empty) app.

## Manual upload

`npm run build && npm run package` writes `thali-pwa-<version>.zip` (pure Node, works on Windows). Unzip and upload the
files to any static host. Do not open `index.html` from disk; service workers need HTTPS (or `http://localhost`).

## Alternatives investigated

- **Cloudflare Pages** — free tier, supports private Git repos and direct upload, unlimited bandwidth for static sites.
  Needs a new Cloudflare account (email sign-up); not set up here because it adds an account. Good fallback if the repo
  must stay private.
- **Netlify** — free tier with drag-and-drop deploy of `dist/` and private repo support. Needs a new account; free plan
  has monthly bandwidth/build-minute caps (ample for one user).
- **claude.ai artifacts** — not suitable: viewing requires a sign-in, artifacts run in a sandboxed page that cannot register
  a service worker or provide a stable installable origin, so no offline install and no durable local storage guarantees.
- **Vercel / Firebase Hosting** — also free but need accounts; no advantage over the above for a static site.

Facts about hosting plans change; confirm current limits on each provider's pricing page before relying on them.

## Verifying a deployment

1. Open the URL in Safari on the iPhone (online) and let it finish loading.
2. Follow `docs/INSTALL_IPHONE.md`, then switch on Airplane mode and reopen from the Home Screen.
3. After a later release, reopen the app while online; an "Update available — reload" bar appears at the bottom.

## Service worker notes

`dist/sw.js` is generated at build time by a small Vite plugin (`vite.config.ts`): it lists every built file and uses a content
hash as the cache name, so each build is a new version and old caches are deleted on activation. Navigation is network-first
(falls back to the cached shell offline); assets are cache-first; cross-origin requests (Open Food Facts) are never intercepted.
Serve `sw.js` without long-lived HTTP caching (GitHub Pages sends a short max-age, which is fine; the browser also bypasses the
HTTP cache for service worker script updates after 24 h at most).
