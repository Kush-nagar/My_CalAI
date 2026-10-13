import { expect, test, type Page } from '@playwright/test';

// Chromium with a fake camera. Not an iPhone test.
test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

async function onboard(page: Page, age: '18 or over' | 'Under 18') {
  await page.goto('/');
  await page.getByText(age).click();
  await page.getByRole('button', { name: 'Start journal' }).click();
}
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByText(name).click();

test('goals, quick add, macro bars, water and worldwide search', async ({ page }) => {
  await onboard(page, '18 or over');
  // Default: water reference only, calories shown as eaten.
  await expect(page.getByText('kcal eaten')).toBeVisible();
  await expect(page.getByText(/0\s*\/\s*2,000\s*ml/)).toBeVisible();

  await nav(page, 'Settings');
  const goals = page.locator('#goals');
  await goals.getByRole('textbox', { name: 'Calories' }).fill('2000');
  await goals.getByRole('button', { name: /Fill protein, carbs and fat/ }).click();
  await expect(goals.getByRole('textbox', { name: 'Protein' })).toHaveValue('100');
  await goals.getByRole('button', { name: 'Save references' }).click();

  await nav(page, 'Today');
  await expect(page.getByText('kcal left')).toBeVisible();
  await expect(page.getByText('2,000 kcal')).toBeVisible();

  // Quick add a smoothie.
  await page.locator('.add-fab').click();
  await page.getByRole('tab', { name: 'Quick add' }).click();
  await page.getByRole('textbox', { name: 'What did you have? (optional)' }).fill('Protein banana smoothie');
  await page.getByRole('textbox', { name: 'Calories' }).fill('320');
  await page.getByRole('textbox', { name: 'Protein' }).fill('28');
  await page.getByRole('dialog').getByRole('button', { name: /^Add to (Breakfast|Lunch|Dinner|Snacks)$/ }).click();
  await expect(page.getByText('Protein banana smoothie').first()).toBeVisible();
  await expect(page.locator('.ring-num')).toHaveText('1,680');
  await expect(page.getByRole('progressbar', { name: 'Protein 28 of 100 grams' })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/today-dashboard.png', fullPage: true });

  // Water: +250, +500, undo.
  await page.getByRole('button', { name: '+ 250 ml' }).click();
  await page.getByRole('button', { name: '+ 500 ml' }).click();
  await expect(page.getByText(/750\s*\/\s*2,000\s*ml/)).toBeVisible();
  await page.getByRole('button', { name: 'Undo last' }).click();
  await expect(page.getByText(/250\s*\/\s*2,000\s*ml/)).toBeVisible();

  // Worldwide foods are searchable.
  await page.locator('.add-fab').click();
  await page.getByLabel('Search foods by name or alias').fill('protein powder whey');
  await expect(page.getByText('Beverages, Protein powder whey based').first()).toBeVisible();
  await page.getByLabel('Search foods by name or alias').fill('sushi');
  await expect(page.getByText(/Sushi roll/).first()).toBeVisible();
});

test('meal camera takes a photo locally and attaches it', async ({ page }) => {
  await onboard(page, '18 or over');
  await page.getByRole('button', { name: 'Log a meal with the camera' }).click();
  await expect(page.getByRole('dialog', { name: 'Meal camera' })).toBeVisible();
  await expect(page.getByText('Photo stays on this device')).toBeVisible();
  const shutter = page.getByRole('button', { name: 'Take photo' });
  await expect(shutter).toBeEnabled({ timeout: 15_000 });
  await page.screenshot({ path: 'test-results/shots/camera.png' });
  await shutter.click();
  await expect(page.getByRole('dialog', { name: 'Meal camera' })).toHaveCount(0);
  await expect(page.getByAltText('Your meal photo, shown only on this device')).toBeVisible();
  // Model not set up: suggestions are offered as an option, search stays available.
  await expect(page.getByText(/Optional: suggest food names from a photo/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose food' })).toBeVisible();
});

test('under-18 mode shows no calorie or macro targets', async ({ page }) => {
  await onboard(page, 'Under 18');
  await expect(page.locator('.ring')).toHaveCount(0);
  await expect(page.getByText('kcal left')).toHaveCount(0);
  await expect(page.getByText('Set daily references (optional)')).toHaveCount(0);
  await expect(page.getByText(/0\s*\/\s*2,000\s*ml/)).toBeVisible();
  await nav(page, 'Settings');
  await expect(page.locator('#goals').getByRole('textbox', { name: 'Calories' })).toHaveCount(0);
  await expect(page.locator('#goals').getByRole('textbox', { name: 'Water' })).toBeVisible();
});
