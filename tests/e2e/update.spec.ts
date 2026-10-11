import { expect, test } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

// Regression: after a new version is deployed, going offline must not leave a blank app
// (new index.html pointing at assets the cached version doesn't have).
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let server: Server;
let dir: string;
const PORT = 4188;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'thali-dist-'));
  cpSync('dist', dir, { recursive: true });
  server = createServer((req, res) => {
    let p = join(dir, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(readFileSync(p));
  });
  await new Promise<void>((r) => server.listen(PORT, r));
});
test.afterAll(() => server?.close());

test('app still opens offline after a new version was deployed', async ({ page, context }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(0), { once: true }));
  });

  // Simulate a deploy: entry chunk renamed, index.html + sw.js changed.
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const m = html.match(/assets\/(index-[^"]+\.js)/)!;
  copyFileSync(join(dir, 'assets', m[1]), join(dir, 'assets', 'index-NEW.js'));
  writeFileSync(join(dir, 'index.html'), html.replace(m[0], 'assets/index-NEW.js'));
  const sw = readFileSync(join(dir, 'sw.js'), 'utf8').replace(/const VERSION = '[^']+'/, "const VERSION = 'v2test'").replace(m[0], 'assets/index-NEW.js');
  writeFileSync(join(dir, 'sw.js'), sw);

  await page.reload(); // online: new worker installs and waits
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.getByText(/Thali|Today/).first()).toBeVisible();
  await context.setOffline(false);
});
