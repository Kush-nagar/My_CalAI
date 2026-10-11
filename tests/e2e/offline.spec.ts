import { expect, test } from '@playwright/test';

test('app shell and IndexedDB work offline after first load', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#app')).not.toBeEmpty();

  // Wait until the service worker is active and controls this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }));
    }
  });
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Everything built is precached, including the lazily imported seed chunk.
  const missing = await page.evaluate(async () => {
    const sw = await (await fetch('./sw.js')).text();
    const list: string[] = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)![1]);
    const keys = await caches.keys();
    const c = await caches.open(keys.find((k) => k.startsWith('thali-'))!);
    const out: string[] = [];
    for (const f of list) if (!(await c.match(new URL(f, document.baseURI).href))) out.push(f);
    return { out, list };
  });
  expect(missing.out).toEqual([]);
  expect(missing.list.some((f) => /\.json$|seed|foods/i.test(f))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  // The shell renders (app root has content, no browser offline error page).
  await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.locator('main')).toBeVisible();

  // IndexedDB still works offline: write + read a kv value.
  const val = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('thali-ledger');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put('offline-ok', 'e2e-probe');
          tx.oncomplete = () => {
            const r = db.transaction('kv').objectStore('kv').get('e2e-probe');
            r.onsuccess = () => resolve(r.result as string);
            r.onerror = () => reject(r.error);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  expect(val).toBe('offline-ok');
  await context.setOffline(false);
});

test('manifest and icons are served', async ({ request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m).toMatchObject({ short_name: 'Thali', display: 'standalone', start_url: './', scope: './' });
  for (const icon of m.icons) expect((await request.get('/' + icon.src)).ok()).toBe(true);
  expect((await request.get('/icons/apple-touch-icon.png')).ok()).toBe(true);
});
