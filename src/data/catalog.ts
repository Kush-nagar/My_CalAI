import type { Food } from '../domain/types';
import { expandGlobal, type GlobalFile } from './global';

/**
 * Bundled, license-cleared seed catalog. Produced by scripts/data (see docs/DATA_SOURCES.md):
 * curated foods with regional aliases (foods.json) + every other USDA FoodData Central food
 * (global.json, all cuisines). Loaded lazily so the shell paints first; the service worker
 * precaches both chunks for offline use.
 */
let cache: Promise<Food[]> | null = null;

export function loadSeedFoods(): Promise<Food[]> {
  cache ??= Promise.all([import('./seed/foods.json'), import('./seed/global.json')]).then(([c, g]) => [
    ...(c.default as unknown as { foods: Food[] }).foods,
    ...expandGlobal(g.default as unknown as GlobalFile),
  ]);
  return cache;
}
