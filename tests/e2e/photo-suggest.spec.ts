import { expect, test, type Page } from '@playwright/test';

// Chromium (WASM backend) only. This is NOT an iPhone/Safari test; see docs/PHOTO_SUGGESTIONS.md.
test.setTimeout(180_000);

const entryCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const r = indexedDB.open('thali-ledger');
        r.onsuccess = () => {
          const q = r.result.transaction('entries').objectStore('entries').count();
          q.onsuccess = () => { resolve(q.result); r.result.close(); };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );

test('opt-in download, offline suggestions, confirm before logging, removal fallback', async ({ page, context }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto('/');
  await page.getByText('18 or over').click();
  await page.getByRole('button', { name: 'Start journal' }).click();
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  });

  // Disabled by default: nothing model-related is requested or precached by the service worker.
  expect(requests.some((u) => /models\/|ort\/|\.onnx/.test(u))).toBe(false);
  const precached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return urls;
  });
  expect(precached.length).toBeGreaterThan(5);
  expect(precached.filter((u) => /\.onnx|ort-wasm|\/models\//.test(u))).toEqual([]);

  // A photo to work with: a screenshot of the app itself (no food images are bundled or scraped).
  const photo = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 390 } });

  // Opt in from Settings: size is disclosed before anything downloads.
  await page.getByRole('navigation', { name: 'Main' }).getByText('Settings').click();
  await page.getByRole('button', { name: 'Set up photo suggestions' }).click();
  await expect(page.getByRole('heading', { name: /Download \d+ MB\?/ })).toBeVisible();
  expect(requests.some((u) => /\.onnx/.test(u))).toBe(false);
  await page.getByRole('button', { name: /^Download \d+ MB$/ }).click();
  await expect(page.getByText(/Photo suggestions are ready and work offline/)).toBeVisible({ timeout: 120_000 });
  // Only same-origin requests for the model.
  const origin = new URL(page.url()).origin;
  expect(requests.filter((u) => /\.onnx|ort-wasm/.test(u)).every((u) => u.startsWith(origin))).toBe(true);

  // Offline from here on.
  await context.setOffline(true);
  await page.reload();
  const before = requests.length;

  await page.locator('.add-fab').click();
  await page.getByRole('tab', { name: 'Photo' }).click();
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: photo });
  // With the model ready, a new photo is looked at straight away (no extra tap).
  await expect(page.getByText(/Possible matches|can't tell what this is/)).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'test-results/shots/suggest-review.png', fullPage: true });

  // No diary write yet.
  expect(await entryCount(page)).toBe(0);

  const anyway = page.getByRole('button', { name: 'Show possible matches anyway' });
  if (await anyway.isVisible()) await anyway.click();
  await page.locator('.cand-food input[type=checkbox]').first().check();
  await page.getByRole('button', { name: /^Next: choose amount/ }).click();

  // Amount starts empty; still nothing written.
  await expect(page.getByText('Name suggested from your photo.', { exact: false })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Amount', exact: true })).toHaveValue('');
  expect(await entryCount(page)).toBe(0);
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('1');
  await page.getByRole('dialog').getByRole('button', { name: /^Add to (Breakfast|Lunch|Dinner|Snacks)$/ }).click();
  await expect.poll(() => entryCount(page)).toBe(1);

  // No network at all while offline (requests list only grows with same-origin SW-served URLs).
  expect(requests.slice(before).every((u) => u.startsWith(origin) || u.startsWith('blob:') || u.startsWith('data:'))).toBe(true);

  // Remove the model: suggestions disappear, photo memory aid remains.
  await page.getByRole('navigation', { name: 'Main' }).getByText('Settings').click();
  await page.getByRole('button', { name: 'Remove model' }).click();
  await expect(page.getByRole('button', { name: 'Set up photo suggestions' })).toBeVisible();
  const cachesLeft = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('model-cache:')));
  expect(cachesLeft).toEqual([]);
  await page.locator('.add-fab').click();
  await page.getByRole('tab', { name: 'Photo' }).click();
  await expect(page.getByText(/Optional: suggest food names from a photo/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open camera' })).toBeVisible();
  await expect(page.getByText('Choose from library')).toBeVisible();
  await context.setOffline(false);
});

test('evicted model falls back gracefully', async ({ page }) => {
  await page.goto('/');
  await page.getByText('18 or over').click();
  await page.getByRole('button', { name: 'Start journal' }).click();
  // Simulate: user had opted in, then iOS removed the cache.
  await page.getByRole('navigation', { name: 'Main' }).getByText('Settings').click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open('thali-ledger');
        r.onsuccess = () => {
          const tx = r.result.transaction('kv', 'readwrite');
          const st = tx.objectStore('kv');
          const g = st.get('settings');
          g.onsuccess = () => { st.put({ ...g.result, photoSuggestions: true }, 'settings'); };
          tx.oncomplete = () => { r.result.close(); resolve(); };
        };
      }),
  );
  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByText('Settings').click();
  await expect(page.getByText(/isn't fully on this device/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download again' })).toBeVisible();
  await page.locator('.add-fab').click();
  await page.getByRole('tab', { name: 'Photo' }).click();
  await expect(page.getByRole('button', { name: 'Open camera' })).toBeVisible();
  await expect(page.getByText('Choose from library')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suggest food names' })).toHaveCount(0);
});
