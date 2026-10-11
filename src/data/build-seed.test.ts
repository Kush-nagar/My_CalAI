// Unit tests for the seed builder (scripts/data/seed-lib.mjs) against a SYNTHETIC fixture.
// The fixture numbers are made up to exercise code paths; they are not shipped.
import { describe, expect, it } from 'vitest';
import fixture from '../../scripts/data/fixtures/usda-fixture.json';
import { buildFood, buildSeed, cleanPortionLabel, indexExtract, mapNutrients, type UsdaExtract } from '../../scripts/data/seed-lib.mjs';
import { calculateRecipe } from '../domain/nutrition';
import { NUTRIENT_CODES } from '../domain/types';

const extract = fixture as unknown as UsdaExtract;
const usda = (id: number) => extract.foods.find((f) => f.fdcId === id)!;

describe('mapNutrients', () => {
  it('emits all 15 codes; missing is null with reason, reported 0 stays 0', () => {
    const { per100g } = mapNutrients(usda(1));
    expect(Object.keys(per100g).sort()).toEqual([...NUTRIENT_CODES].sort());
    expect(per100g.fiber_g).toEqual({ amount: 0, kind: 'measured' });
    expect(per100g.vitc_mg).toEqual({ amount: null, kind: 'measured', missingReason: 'Not reported by USDA SR Legacy' });
  });
  it('uses Atwater specific, then general, when 1008 energy is absent (and notes it)', () => {
    const a = mapNutrients(usda(2));
    expect(a.per100g.energy_kcal?.amount).toBe(340);
    expect(a.notes.join(' ')).toMatch(/2048/);
    const b = mapNutrients(usda(3));
    expect(b.per100g.energy_kcal?.amount).toBe(355);
    expect(b.notes.join(' ')).toMatch(/2047/);
  });
  it('marks FNDDS values as calculated', () => {
    expect(mapNutrients(usda(4)).per100g.energy_kcal?.kind).toBe('calculated');
  });
});

describe('portions', () => {
  it('drops junk, zero-gram and duplicate labels and records evidence', () => {
    const f = buildFood(usda(1), { dataset: 'sr_legacy', desc: 'Test grain, raw', name: 'Grain' }, extract);
    expect(f.servings).toEqual([
      { label: '1 cup', grams: 200, evidence: 'USDA FDC 1 portion: 1 cup = 200 g', source: 'source_data' },
    ]);
  });
  it('cleans labels', () => {
    expect(cleanPortionLabel('1 1 cup')).toBe('1 cup');
    expect(cleanPortionLabel('Quantity not specified')).toBeNull();
    expect(cleanPortionLabel('2')).toBeNull();
  });
});

describe('resolve + buildFood', () => {
  it('resolves by description taking the latest Foundation sample, and by fdcId', () => {
    const idx = indexExtract(extract);
    expect(idx.resolve({ dataset: 'foundation', desc: 'test pulse, dry', name: 'x' }).food?.fdcId).toBe(3);
    expect(idx.resolve({ dataset: 'foundation', fdcId: 2, desc: '', name: 'x' }).food?.fdcId).toBe(2);
    expect(idx.resolve({ dataset: 'sr_legacy', fdcId: 2, desc: '', name: 'x' }).error).toMatch(/expected sr_legacy/);
    expect(idx.resolve({ dataset: 'sr_legacy', desc: 'nope', name: 'x' }).error).toMatch(/no sr_legacy/);
  });
  it('builds FNDDS dishes with honest labelling and full source', () => {
    const f = buildFood(usda(4), { dataset: 'survey', desc: 'Test curry', name: 'Curry', aliases: ['Curry', ' kari '] }, extract);
    expect(f.id).toBe('fdc:4');
    expect(f.source).toMatchObject({ kind: 'usda_fdc', name: 'USDA FNDDS (US survey recipe)', recordId: '4', edition: 'fixture_survey.zip' });
    expect(f.source.license).toMatch(/CC0/);
    expect(f.notes).toMatch(/US standard recipe/);
    expect(f.notes).toMatch(/USDA description: "Test curry"/);
    expect(f.aliases).toEqual(['kari']);
    expect(f.state).toBe('prepared');
  });
});

describe('buildSeed templates', () => {
  it('matches calculateRecipe (no-yield path is servings-only)', () => {
    const { foods, errors } = buildSeed(
      extract,
      [
        { key: 'grain', dataset: 'sr_legacy', desc: 'Test grain, raw', name: 'Grain' },
        { key: 'curry', dataset: 'survey', desc: 'Test curry', name: 'Curry' },
      ],
      [{ id: 'tpl:test', name: 'Test dish', ingredients: [{ key: 'grain', grams: 100 }, { key: 'curry', grams: 50 }], servings: 3 }],
    );
    expect(errors).toEqual([]);
    const t = foods.find((f) => f.id === 'tpl:test')!;
    expect(t.portionMode).toBe('servings_only');
    expect(t.servings[0].grams).toBeCloseTo(50);
    const ref = calculateRecipe({
      ingredients: [
        { foodId: 'fdc:1', foodName: 'Grain', per100g: foods[0].per100g, source: foods[0].source, state: 'raw', grams: 100 },
        { foodId: 'fdc:4', foodName: 'Curry', per100g: foods[1].per100g, source: foods[1].source, state: 'prepared', grams: 50 },
      ],
      yieldGrams: null,
      servings: 3,
    });
    expect((t.per100g.energy_kcal!.amount! * 150) / 100).toBeCloseTo(ref.batch.values.energy_kcal!);
    expect(t.per100g.vitc_mg?.amount).toBeNull(); // grain lacks vit C -> unknown, not 0
  });
  it('reports unresolved curation and template references as errors', () => {
    const { errors } = buildSeed(extract, [{ dataset: 'sr_legacy', desc: 'missing', name: 'M' }], [
      { id: 'tpl:x', name: 'X', ingredients: [{ key: 'nope', grams: 10 }] },
    ]);
    expect(errors).toHaveLength(2);
  });
});
