import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { openLedger, getSettings, saveSettings, type Ledger } from '../db/db';
import { listCustomFoods, listRecipes } from '../db/repo';
import { loadSeedFoods } from '../data/catalog';
import { recipeAsFood } from '../domain/nutrition';
import { SearchIndex } from '../domain/search';
import type { Food, Recipe, Settings } from '../domain/types';

/** App-wide state shared through context. Catalog = seed + custom foods + recipes-as-foods. */
export interface AppState {
  db: Ledger;
  settings: Settings;
  seed: Food[];
  custom: Food[];
  recipes: Recipe[];
  /** All loggable foods, including archived (for resolving ids); search excludes archived. */
  foodsById: Map<string, Food>;
  index: SearchIndex<Food>;
}

export async function loadState(db?: Ledger): Promise<AppState> {
  db ??= await openLedger();
  const [settings, seed, custom, recipes] = await Promise.all([
    getSettings(db),
    loadSeedFoods(),
    listCustomFoods(db),
    listRecipes(db),
  ]);
  return buildState(db, settings, seed, custom, recipes);
}

export function buildState(db: Ledger, settings: Settings, seed: Food[], custom: Food[], recipes: Recipe[]): AppState {
  const recipeFoods: Food[] = [];
  for (const r of recipes) {
    try {
      recipeFoods.push(recipeAsFood(r));
    } catch {
      // Invalid recipe (e.g. no ingredients) stays editable but not loggable.
    }
  }
  const all = [...custom, ...recipeFoods, ...seed];
  const foodsById = new Map(all.map((f) => [f.id, f]));
  const index = new SearchIndex(all.filter((f) => !f.archived));
  return { db, settings, seed, custom, recipes, foodsById, index };
}

export interface AppActions {
  /** Re-read custom foods/recipes after a write. */
  refreshCatalog(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
}

export const AppCtx = createContext<{ state: AppState; actions: AppActions } | null>(null);

export function useApp() {
  const v = useContext(AppCtx);
  if (!v) throw new Error('AppCtx missing');
  return v;
}

export async function persistSettings(db: Ledger, s: Settings) {
  await saveSettings(db, s);
}

/** Calories visible only if user allows and not in under-18 mode with hidden default. */
export function caloriesVisible(s: Settings): boolean {
  return s.showCalories;
}
