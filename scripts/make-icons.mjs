// Renders public/icons/*.svg to PNGs with Playwright's Chromium (no extra deps).
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const jobs = [
  ['icon.svg', 'apple-touch-icon.png', 180],
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
];
const browser = await chromium.launch();
for (const [src, out, size] of jobs) {
  const svg = readFileSync(`public/icons/${src}`, 'utf8');
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `public/icons/${out}`, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
