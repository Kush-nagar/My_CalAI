// Types for seed-lib.mjs (consumed by vitest suites under src/data/).
import type { Food, FoodState, NutrientMap, ServingConversion } from '../../src/domain/types';

export interface UsdaFood {
  fdcId: number;
  dataset: 'sr_legacy' | 'foundation' | 'survey';
  dataType: string;
  desc: string;
  cat: string | null;
  foodCode?: string;
  published: string;
  n: Record<string, number>;
  portions: { label: string; g: number }[];
}
export interface UsdaExtract {
  retrievedAt: string;
  source: string;
  license: string;
  datasets: { kind: string; file: string; url: string }[];
  foods: UsdaFood[];
}
export interface CurationEntry {
  key?: string;
  fdcId?: number;
  dataset: 'sr_legacy' | 'foundation' | 'survey';
  desc: string;
  name: string;
  aliases?: string[];
  tags?: string[];
  state?: FoodState;
  /** Used only when the state cannot be inferred from the USDA description. */
  defaultState?: FoodState;
  notes?: string;
  noServings?: boolean;
  /** Regex (case-insensitive) of USDA portion labels to drop for this food. */
  dropPortions?: string;
}
export interface TemplateIngredient {
  key?: string;
  foodId?: string;
  grams: number;
}
export interface TemplateSpec {
  id: string;
  name: string;
  aliases?: string[];
  tags?: string[];
  ingredients: TemplateIngredient[];
  yieldGrams?: number | null;
  servings?: number | null;
  method?: string;
  notes?: string;
  /** Label for the per-serving unit, e.g. "1 roti". Default "1 serving". */
  servingLabel?: string;
}

export const NUTRIENT_CODES: string[];
export const LICENSE: string;
export const TEMPLATE_LICENSE: string;
export const DATASET_LABEL: Record<string, string>;
export const FNDDS_SOURCE_NOTE: string;
export function valueKind(dataset: string): 'measured' | 'calculated';
export function mapNutrients(food: UsdaFood): { per100g: NutrientMap; notes: string[] };
export function cleanPortionLabel(label: unknown): string | null;
export function mapPortions(food: UsdaFood, max?: number, drop?: string | null): ServingConversion[];
export function inferState(desc: string, dataset: string): FoodState;
export function indexExtract(extract: UsdaExtract): { resolve(entry: CurationEntry): { food?: UsdaFood; error?: string } };
export function buildFood(usda: UsdaFood, entry: CurationEntry, meta: UsdaExtract): Food;
export function buildTemplate(tpl: TemplateSpec, foodsById: Map<string, Food>): Food;
export function buildSeed(
  extract: UsdaExtract,
  entries: CurationEntry[],
  templates: TemplateSpec[],
): { foods: Food[]; errors: string[]; keyToId: Map<string, string> };
