import {
  NUTRIENT_CODES,
  type Food,
  type NutrientCode,
  type NutrientMap,
  type NutrientTotals,
  type Recipe,
  type ServingConversion,
} from './types';

/** Scale a per-100 g map to absolute totals for `grams`. Unknown stays unknown. */
export function scaleNutrients(per100g: NutrientMap, grams: number): NutrientTotals {
  if (!Number.isFinite(grams) || grams < 0) throw new RangeError('grams must be a finite non-negative number');
  const values: NutrientTotals['values'] = {};
  const incomplete: NutrientCode[] = [];
  for (const code of NUTRIENT_CODES) {
    const v = per100g[code];
    if (v && v.amount !== null && Number.isFinite(v.amount)) {
      values[code] = (v.amount * grams) / 100;
    } else {
      // Not reported (absent) or explicitly missing: unknown, not zero.
      incomplete.push(code);
    }
  }
  return { values, incomplete };
}

/** Sum totals. A nutrient is known only if every part knows it. */
export function sumTotals(parts: NutrientTotals[]): NutrientTotals {
  const values: NutrientTotals['values'] = {};
  const incomplete = new Set<NutrientCode>();
  for (const code of NUTRIENT_CODES) {
    let sum = 0;
    let anyKnown = false;
    for (const p of parts) {
      const v = p.values[code];
      if (v !== undefined) {
        sum += v;
        anyKnown = true;
      }
      if (p.incomplete.includes(code)) incomplete.add(code);
    }
    // Keep partial sums visible as lower bounds, flagged incomplete.
    if (anyKnown) values[code] = sum;
  }
  return { values, incomplete: NUTRIENT_CODES.filter((c) => incomplete.has(c)) };
}

/** A nutrient total is fully known when present and not flagged incomplete. */
export function isKnown(t: NutrientTotals, code: NutrientCode): boolean {
  return t.values[code] !== undefined && !t.incomplete.includes(code);
}

export interface RecipeResult {
  /** Whole-batch totals from raw ingredient weights. */
  batch: NutrientTotals;
  rawGrams: number;
  /** Per 100 g of cooked dish; null unless yield was weighed. */
  per100gCooked: NutrientMap | null;
  /** Totals for one serving; null unless servings set. */
  perServing: NutrientTotals | null;
  servingGrams: number | null;
  assumptions: string[];
}

/**
 * Recipe nutrients = Σ(ingredient per100g × grams/100); per-100g cooked = batch / yield × 100.
 * Water gained/lost in cooking changes concentration, not batch energy.
 */
export function calculateRecipe(r: Pick<Recipe, 'ingredients' | 'yieldGrams' | 'servings'>): RecipeResult {
  if (r.ingredients.length === 0) throw new Error('Recipe needs at least one ingredient');
  for (const i of r.ingredients) {
    if (!(i.grams > 0) || !Number.isFinite(i.grams)) throw new RangeError(`Invalid grams for ${i.foodName}`);
  }
  if (r.yieldGrams !== null && !(r.yieldGrams > 0)) throw new RangeError('Cooked yield must be > 0 g');
  if (r.servings !== null && !(r.servings > 0)) throw new RangeError('Servings must be > 0');

  const batch = sumTotals(r.ingredients.map((i) => scaleNutrients(i.per100g, i.grams)));
  const rawGrams = r.ingredients.reduce((s, i) => s + i.grams, 0);
  const assumptions: string[] = [
    'Calculated from the ingredient weights you entered; assumes everything listed ends up in the dish.',
  ];

  let per100gCooked: NutrientMap | null = null;
  if (r.yieldGrams !== null) {
    per100gCooked = totalsToPer100g(batch, r.yieldGrams);
    assumptions.push(`Per-100 g values use the weighed cooked yield of ${round1(r.yieldGrams)} g.`);
  } else {
    assumptions.push('Cooked yield not weighed, so gram portions of the cooked dish cannot be calculated.');
  }

  let perServing: NutrientTotals | null = null;
  let servingGrams: number | null = null;
  if (r.servings !== null) {
    perServing = divideTotals(batch, r.servings);
    if (r.yieldGrams !== null) servingGrams = r.yieldGrams / r.servings;
    assumptions.push(`One serving is 1/${r.servings} of the batch.`);
  }
  if (batch.incomplete.length) {
    assumptions.push('Some ingredients lack values for certain nutrients; those totals are lower bounds.');
  }
  return { batch, rawGrams, per100gCooked, perServing, servingGrams, assumptions };
}

export function divideTotals(t: NutrientTotals, divisor: number): NutrientTotals {
  const values: NutrientTotals['values'] = {};
  for (const [k, v] of Object.entries(t.values)) values[k as NutrientCode] = (v as number) / divisor;
  return { values, incomplete: [...t.incomplete] };
}

/** Convert absolute totals over `grams` to a per-100 g map, carrying unknowns as missing. */
export function totalsToPer100g(t: NutrientTotals, grams: number): NutrientMap {
  const out: NutrientMap = {};
  for (const code of NUTRIENT_CODES) {
    const v = t.values[code];
    if (v !== undefined && !t.incomplete.includes(code)) {
      out[code] = { amount: (v * 100) / grams, kind: 'calculated' };
    } else {
      out[code] = { amount: null, kind: 'calculated', missingReason: 'One or more ingredients lack this value' };
    }
  }
  return out;
}

/** Present a recipe as a loggable Food. */
export function recipeAsFood(r: Recipe): Food {
  const res = calculateRecipe(r);
  const servings: ServingConversion[] = [];
  let per100g: NutrientMap;
  let portionMode: Food['portionMode'] = 'any';
  if (res.per100gCooked) {
    per100g = res.per100gCooked;
    if (res.servingGrams !== null) {
      servings.push({
        label: '1 serving',
        grams: res.servingGrams,
        evidence: `Weighed yield ${round1(r.yieldGrams!)} g ÷ ${r.servings} servings`,
        source: 'user_calibrated',
      });
    }
  } else {
    // No weighed yield: express per "raw batch gram" internally, but only allow servings.
    per100g = totalsToPer100g(res.batch, res.rawGrams);
    portionMode = 'servings_only';
    const n = r.servings ?? 1;
    servings.push({
      label: r.servings ? '1 serving' : 'Whole batch',
      grams: res.rawGrams / n,
      evidence: r.servings
        ? `1/${n} of batch (cooked weight unknown; gram figure is raw ingredient weight)`
        : 'Whole batch (cooked weight unknown)',
      source: 'user_calibrated',
    });
  }
  return {
    id: r.id,
    name: r.name,
    aliases: r.aliases,
    state: 'prepared',
    tags: ['recipe'],
    source: { kind: 'recipe', name: 'Your recipe (calculated from ingredient weights)', recordId: r.id },
    per100g,
    servings,
    portionMode,
    revision: r.revision,
    archived: r.archived,
    updatedAt: r.updatedAt,
  };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Display rounding only; stored values keep full precision. */
export function formatAmount(n: number, unit: string): string {
  const abs = Math.abs(n);
  const v = unit === 'kcal' ? Math.round(n) : abs >= 100 ? Math.round(n) : abs >= 10 ? round1(n) : Math.round(n * 100) / 100;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
