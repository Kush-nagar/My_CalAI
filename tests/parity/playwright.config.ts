import { defineConfig } from '@playwright/test';

// Checks that the in-browser pipeline (canvas-free preprocessing + ORT WASM in a worker) reproduces
// the reference embedding computed in CI with the official SigLIP2 processor. Chromium/WASM only.
export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5199' },
  webServer: { command: 'npx vite --port 5199 --strictPort', cwd: '../..', url: 'http://localhost:5199', reuseExistingServer: false, timeout: 60_000 },
});
