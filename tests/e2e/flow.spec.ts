import { expect, test } from '@playwright/test';

// Core P0 journey: onboard → create custom food → log portion → survives offline reload.
test('log a custom food and keep it offline', async ({ page, context }) => {
  await page.goto('/');
  await page.getByText('18 or over').click();
  await page.getByRole('button', { name: 'Start journal' }).click();
  await page.screenshot({ path: 'test-results/shots/today-empty.png' });

  await page.locator('.add-fab').click();
  await page.getByLabel('Search foods by name or alias').fill('Amma ka dosa batter');
  await page.getByRole('button', { name: 'Create custom food' }).first().click();
  await page.getByLabel('Other names (optional)').fill('dosa maavu');
  await page.getByRole('textbox', { name: 'Energy' }).fill('150');
  await page.getByRole('textbox', { name: 'Protein' }).fill('4.5');
  await page.getByRole('button', { name: 'Save food' }).click();

  // Portion sheet: 120 g, then save.
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('120');
  await expect(page.getByText('Fibre')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/portion.png', fullPage: true });
  await page.getByRole('button', { name: /^Add to (Breakfast|Lunch|Dinner|Snacks)$/ }).click();

  await expect(page.getByText('Amma ka dosa batter').first()).toBeVisible();
  // 150 kcal/100 g × 120 g = 180 kcal
  await expect(page.getByText(/180/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/today-logged.png' });

  // Service worker in control, then offline reload keeps app + data.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Amma ka dosa batter').first()).toBeVisible();

  // Search finds it by alias while offline.
  await page.locator('.add-fab').click();
  await page.getByLabel('Search foods by name or alias').fill('dosa mavu');
  await expect(page.getByRole('list', { name: /results/ }).getByText('Amma ka dosa batter')).toBeVisible();
  await context.setOffline(false);
});
