import { expect, test } from '@playwright/test';

// Uses the tiny fixture pack written by scripts/packs/fixture.mjs (Chromium; not an iPhone test).
test('download a food database, search branded products and log one, offline', async ({ page, context }) => {
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto('/');
  await page.getByText('18 or over').click();
  await page.getByRole('button', { name: 'Start journal' }).click();
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  });
  expect(reqs.some((u) => /packs\/usda-branded\/\d+\.txt/.test(u))).toBe(false); // nothing before opt-in

  await page.getByRole('navigation', { name: 'Main' }).getByText('Settings').click();
  const card = page.locator('.card-inner', { hasText: 'USDA branded foods' });
  await expect(card.getByText('3 products')).toBeVisible();
  await card.getByRole('button', { name: /^Download/ }).click();
  await expect(card.getByText('On this device')).toBeVisible();
  const origin = new URL(page.url()).origin;
  expect(reqs.filter((u) => /packs\//.test(u)).every((u) => u.startsWith(origin))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByText('Today').click();
  await page.locator('.add-fab').click();
  await page.getByLabel('Search foods by name or alias').fill('whey isolate');
  await expect(page.getByRole('heading', { name: 'Packaged & branded' })).toBeVisible();
  await page.getByText('Whey Protein Isolate, Vanilla — Muscle Co').click();
  await page.getByRole('button', { name: /1 × 1 serving/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Add to (Breakfast|Lunch|Dinner|Snacks)$/ }).click();
  await expect(page.getByText('Whey Protein Isolate, Vanilla — Muscle Co').first()).toBeVisible();
  // 370 kcal/100 g × 30 g = 111 kcal
  await page.getByRole('navigation', { name: 'Main' }).getByText('Today').click();
  await expect(page.locator('.ring-num')).toHaveText('111');

  // Remove: branded results disappear, logged entry stays.
  await context.setOffline(false);
  await page.getByRole('navigation', { name: 'Main' }).getByText('Settings').click();
  await card.getByRole('button', { name: 'Remove' }).click();
  await expect(card.getByRole('button', { name: /^Download/ })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByText('Today').click();
  await expect(page.getByText('Whey Protein Isolate, Vanilla — Muscle Co').first()).toBeVisible();
});
