# Licences of dependencies and data

Licences below were read from `node_modules/<pkg>/package.json` and the package's LICENSE file
(checked 2026-10-11). Other workers append their own rows (data sources, fonts) to this table.

| item | purpose | license | cost | offline | limitations |
|---|---|---|---|---|---|
| preact 10.x | UI runtime (shipped) | MIT | free | yes, bundled | none |
| idb 8.x | IndexedDB promise wrapper (shipped) | ISC | free | yes, bundled | none |
| zxing-wasm 3.1.5 (reader build) | Camera barcode decoding for EAN-13/EAN-8/UPC-A/UPC-E; iOS Safari has no BarcodeDetector (shipped, lazy-loaded) | wrapper MIT; bundled `zxing_reader.wasm` is zxing-cpp, Apache-2.0 | free | yes; WASM (~967 kB, ~418 kB gzip) is bundled and served locally, not from the CDN default | needs `'wasm-unsafe-eval'` in CSP (already set); decoding is CPU-bound on older iPhones; not verified on a real iOS device in the cloud container |
| zxing-wasm writer build (`zxing_writer.wasm`) | Test only: generates barcode images to round-trip the decoder. NOT shipped | wrapper MIT; zxing-cpp Apache-2.0; embeds zint (see zxing-wasm README for its licences) | free | n/a | dev/test only; never bundled into `dist/` |
| vite 6.x | Build tool (dev) | MIT | free | n/a | build time only |
| @preact/preset-vite 2.x | Preact integration for Vite (dev) | MIT | free | n/a | build time only |
| typescript 5.x | Type checking (dev) | Apache-2.0 | free | n/a | build time only |
| vitest 3.x | Unit tests (dev) | MIT | free | n/a | test time only |
| fake-indexeddb 6.x | IndexedDB in Node tests (dev) | Apache-2.0 | free | n/a | test time only |
| @playwright/test 1.56 | End-to-end tests and icon rendering (dev) | Apache-2.0 | free | n/a | Chromium only in the cloud container; WebKit unavailable |
| @types/node 22.x | Node typings for `vite.config.ts`, scripts and e2e (dev) | MIT | free | n/a | types only |
| Playwright Chromium | Headless browser used by e2e and `npm run icons` (dev, not shipped) | BSD-3-Clause and component licences (Chromium project) | free | n/a | not part of the app |
| Thali icon set (`public/icons/*`) | App icons | Original artwork created for this project (no third-party assets) | free | yes, precached | simple abstract thali plate; PNGs generated from the SVGs by `npm run icons` |
| Open Food Facts (runtime lookup, optional) | Opt-in packaged-food nutrition by barcode | Database: ODbL 1.0; contents: Database Contents Licence; images: CC BY-SA (images are NOT fetched or stored) | free, no key | no; online and user-triggered only | community-contributed, quality varies; attribution "ODbL — © Open Food Facts contributors" shown before saving; browsers cannot set a custom User-Agent as OFF requests; saved items become custom foods with source `off`, retrieval date and barcode |
| actions/checkout, actions/setup-node, actions/configure-pages, actions/upload-pages-artifact, actions/deploy-pages (CI) | GitHub Pages deploy workflow | MIT | free for public repos (see docs/DEPLOY.md for private repos) | n/a | CI only; not part of the app |
