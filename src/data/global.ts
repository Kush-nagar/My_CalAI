import type { Food, FoodState, NutrientCode, NutrientMap, ServingConversion } from '../domain/types';

/** Compact USDA rows from scripts/data/build-global.mjs. */
export interface GlobalFile {
  version: string;
  retrievedAt: string;
  editions: Record<string, string>;
  nutrients: NutrientCode[];
  foods: [number, string, number, string, string, (number | null)[], [string, number][], number][];
}

const DS = ['sr_legacy', 'survey', 'foundation'] as const;
const DS_NAME = ['USDA FoodData Central — SR Legacy', 'USDA FNDDS (US survey recipe)', 'USDA FoodData Central — Foundation'];
const LICENSE = 'CC0 1.0 (public domain); citation requested';
const STATES = new Set<FoodState>(['raw', 'cooked', 'prepared', 'packaged', 'dry', 'unknown']);

/** Expand compact rows into Food records (worldwide USDA coverage, tagged "usda-global"). */
export function expandGlobal(g: GlobalFile): Food[] {
  return g.foods.map(([fdcId, desc, ds, state, cat, n, portions, flags]) => {
    const dataset = DS[ds] ?? 'sr_legacy';
    const label = dataset === 'survey' ? 'FNDDS' : dataset === 'foundation' ? 'Foundation' : 'SR Legacy';
    const kind = dataset === 'survey' ? 'calculated' : 'measured';
    const per100g: NutrientMap = {};
    g.nutrients.forEach((code, i) => {
      const v = n[i];
      per100g[code] = typeof v === 'number' ? { amount: v, kind } : { amount: null, kind, missingReason: `Not reported by USDA ${label}` };
    });
    const servings: ServingConversion[] = portions.map(([l, grams]) => ({
      label: l,
      grams,
      evidence: `USDA FDC ${fdcId} portion: ${l} = ${grams} g`,
      source: 'source_data',
    }));
    const notes = [
      dataset === 'survey' ? 'Values reflect a US standard recipe; home and restaurant versions vary.' : '',
      flags & 1 ? 'Energy is from USDA Atwater factors because USDA reports no standard energy value for this food.' : '',
      `USDA description: "${desc}".`,
    ].filter(Boolean);
    return {
      id: `fdc:${fdcId}`,
      name: desc,
      aliases: [],
      state: STATES.has(state as FoodState) ? (state as FoodState) : 'unknown',
      tags: ['usda-global', ...(cat ? [cat.toLowerCase()] : [])],
      source: {
        kind: 'usda_fdc',
        name: DS_NAME[ds] ?? DS_NAME[0],
        recordId: String(fdcId),
        edition: g.editions[dataset],
        license: LICENSE,
        retrievedAt: g.retrievedAt,
        url: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`,
      },
      per100g,
      servings,
      notes: notes.join(' '),
      portionMode: 'any',
      revision: 1,
    };
  });
}
