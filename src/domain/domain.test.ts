import { describe, expect, it } from 'vitest';
import { calculateRecipe, recipeAsFood, scaleNutrients, sumTotals } from './nutrition';
import { buildEntry, editEntryPortion, makePortion, shiftDate, unitOptions } from './portion';
import { SearchIndex, skeleton } from './search';
import type { Food, NutrientMap, Recipe } from './types';

const rice: NutrientMap = {
  energy_kcal: { amount: 365, kind: 'measured' },
  protein_g: { amount: 7.1, kind: 'measured' },
  fat_g: { amount: 0.66, kind: 'measured' },
  fiber_g: { amount: null, kind: 'measured', missingReason: 'not reported' },
};
const ghee: NutrientMap = { energy_kcal: { amount: 900, kind: 'measured' }, fat_g: { amount: 100, kind: 'measured' }, protein_g: { amount: 0, kind: 'measured' } };

const food = (id: string, name: string, per100g: NutrientMap, extra: Partial<Food> = {}): Food => ({
  id, name, aliases: [], state: 'raw', tags: [], source: { kind: 'user', name: 'test' }, per100g, servings: [], revision: 1, ...extra,
});

describe('scaleNutrients', () => {
  it('scales per 100 g linearly', () => {
    const t = scaleNutrients(rice, 50);
    expect(t.values.energy_kcal).toBeCloseTo(182.5);
    expect(t.values.protein_g).toBeCloseTo(3.55);
  });
  it('keeps missing distinct from zero', () => {
    const t = scaleNutrients(rice, 100);
    expect(t.values.fiber_g).toBeUndefined();
    expect(t.incomplete).toContain('fiber_g');
    expect(t.incomplete).toContain('sodium_mg'); // absent == unknown
    expect(scaleNutrients(ghee, 10).values.protein_g).toBe(0); // reported zero stays zero
  });
  it('rejects bad grams', () => {
    expect(() => scaleNutrients(rice, -1)).toThrow();
    expect(() => scaleNutrients(rice, NaN)).toThrow();
  });
});

describe('sumTotals', () => {
  it('flags incomplete when any part is unknown, keeps lower bound', () => {
    const s = sumTotals([scaleNutrients(rice, 100), scaleNutrients(ghee, 10)]);
    expect(s.values.energy_kcal).toBeCloseTo(455);
    expect(s.incomplete).not.toContain('energy_kcal');
    expect(s.incomplete).toContain('fiber_g');
  });
});

describe('calculateRecipe', () => {
  const r: Pick<Recipe, 'ingredients' | 'yieldGrams' | 'servings'> = {
    ingredients: [
      { foodId: 'a', foodName: 'rice', per100g: rice, source: { kind: 'user', name: 't' }, state: 'dry', grams: 200 },
      { foodId: 'b', foodName: 'ghee', per100g: ghee, source: { kind: 'user', name: 't' }, state: 'raw', grams: 10 },
    ],
    yieldGrams: 600, // absorbed water
    servings: 3,
  };
  it('conserves batch energy and divides by cooked yield', () => {
    const res = calculateRecipe(r);
    expect(res.batch.values.energy_kcal).toBeCloseTo(730 + 90);
    expect(res.per100gCooked!.energy_kcal!.amount).toBeCloseTo(820 / 6);
    expect(res.perServing!.values.energy_kcal).toBeCloseTo(820 / 3);
    expect(res.servingGrams).toBeCloseTo(200);
    expect(res.per100gCooked!.fiber_g!.amount).toBeNull();
  });
  it('without yield only servings are loggable', () => {
    const f = recipeAsFood({ ...r, id: 'r:1', name: 'Rice', aliases: [], revision: 1, updatedAt: '', yieldGrams: null });
    expect(f.portionMode).toBe('servings_only');
    expect(unitOptions(f).map((u) => u.unit)).toEqual(['1 serving']);
    const p = makePortion(f, 1, '1 serving');
    expect(scaleNutrients(f.per100g, p.grams).values.energy_kcal).toBeCloseTo(820 / 3);
  });
  it('validates inputs', () => {
    expect(() => calculateRecipe({ ...r, ingredients: [] })).toThrow();
    expect(() => calculateRecipe({ ...r, yieldGrams: 0 })).toThrow();
  });
});

describe('entries', () => {
  const f = food('x', 'Rice', rice, { servings: [{ label: '1 cup cooked', grams: 158, evidence: 'USDA portion', source: 'source_data' }] });
  it('only offers evidence-backed units', () => {
    expect(unitOptions(f).map((u) => u.unit)).toEqual(['g', '1 cup cooked']);
    expect(() => makePortion(f, 1, '1 katori')).toThrow();
  });
  it('snapshot is immutable against catalog changes and edits recompute from captured basis', () => {
    const e = buildEntry({ food: f, portion: makePortion(f, 2, '1 cup cooked'), meal: 'lunch', localDate: '2026-10-11' });
    expect(e.portion.grams).toBe(316);
    f.per100g.energy_kcal = { amount: 1, kind: 'user' }; // catalog edited later
    expect(e.nutrients.values.energy_kcal).toBeCloseTo(365 * 3.16);
    const e2 = editEntryPortion(e, { quantity: 100, unit: 'g', grams: 100, conversionEvidence: 'g' });
    expect(e2.nutrients.values.energy_kcal).toBeCloseTo(365);
  });
  it('shifts dates across month boundaries', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('search', () => {
  const idx = new SearchIndex([
    food('1', 'Lentils, red, raw', {}, { aliases: ['masoor dal', 'मसूर दाल'] }),
    food('2', 'Cottage cheese (paneer)', {}, { aliases: ['paneer', 'panir'] }),
    food('3', 'Chapati', {}, { aliases: ['roti', 'phulka'] }),
    food('4', 'Okra, raw', {}, { aliases: ['bhindi', 'lady finger'] }),
  ]);
  it('matches aliases and transliteration variants', () => {
    expect(idx.search('masur daal')[0]?.item.id).toBe('1');
    expect(idx.search('chapathi')[0]?.item.id).toBe('3');
    expect(idx.search('bindi')[0]?.item.id).toBe('4');
    expect(idx.search('मसूर')[0]?.item.id).toBe('1');
    expect(idx.search('roti')[0]?.item.id).toBe('3');
  });
  it('skeleton merges common spellings conservatively', () => {
    expect(skeleton('daal')).toBe(skeleton('dal'));
    expect(skeleton('paneer')).toBe(skeleton('panir'));
    expect(skeleton('poha')).not.toBe(skeleton('pova'));
  });
});
