// @ts-nocheck -- evaluates Vite dev-server module URLs inside the page.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const ref = JSON.parse(readFileSync(new URL('../fixtures/vision-reference.json', import.meta.url), 'utf8'));

test('in-browser SigLIP2 embedding matches the CI reference (cosine > 0.99)', async ({ page }) => {
  page.on('console', (m) => console.log('PAGE', m.type(), m.text()));
  await page.goto('/');
  const out = await page.evaluate(async (refEmb) => {
    const dl = await import('/src/vision/download.ts');
    const rec = await import('/src/vision/recognizer.ts');
    const pre = await import('/src/vision/preprocess.ts');
    const m = rec.modelManifest();
    const t0 = performance.now();
    await dl.downloadModel(m, {});
    const t1 = performance.now();
    const r = new rec.Recognizer(m);
    const backend = await r.load();
    const t2 = performance.now();
    const px = pre.referenceImageRGBA(224);
    const input = pre.toPixelValues(px, 224, 224, rec.SPEC);
    const [e] = await r.embed([input]);
    const t3 = performance.now();
    let dot = 0, n = 0;
    for (let i = 0; i < e.length; i++) { dot += e[i] * refEmb[i]; n += e[i] * e[i]; }
    return { backend, cos: dot / Math.sqrt(n), dl: t1 - t0, load: t2 - t1, run: t3 - t2 };
  }, ref.embedding);
  console.log(JSON.stringify(out));
  expect(out.cos).toBeGreaterThan(0.99);
});
