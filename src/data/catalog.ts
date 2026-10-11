import type { Food } from '../domain/types';

/**
 * Bundled, license-cleared seed catalog. Produced by scripts/data (see docs/DATA_SOURCES.md).
 * Loaded lazily so the shell paints first; the service worker precaches the chunk for offline use.
 */
let cache: Promise<Food[]> | null = null;

export function loadSeedFoods(): Promise<Food[]> {
  cache ??= import('./seed/foods.json').then((m) => (m.default as unknown as { foods: Food[] }).foods);
  return cache;
}
