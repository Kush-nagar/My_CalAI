import { describe, expect, it } from 'vitest';
import { dailySeries, dateRange, defaultMeal, foodFromEntry, parseDecimal, portionLabel, splitAliases, trendStats } from './helpers';
import { buildEntry, makePortion } from '../domain/portion';
import type { Food } from '../domain/types';

const at = (h: number, m = 0) => new Date(2026, 9, 10, h, m);

describe('defaultMeal', () => {
  it('maps time of day', () => {
    expect(defaultMeal(at(8))).toBe('breakfast');
    expect(defaultMeal(at(13))).toBe('lunch');
    expect(defaultMeal(at(17))).toBe('snack');
    expect(defaultMeal(at(20))).toBe('dinner');
    expect(defaultMeal(at(2))).toBe('snack');
  });
});

describe('parseDecimal', () => {
  it('accepts plain decimals and comma separators', () => {
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal(' 2,5 ')).toBe(2.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('0')).toBe(0);
  });
  it('rejects junk, negatives and blanks', () => {
    for (const bad of ['', ' ', '-1', '1e3', 'abc', '1.2.3', '1,000.5']) expect(parseDecimal(bad)).toBeNull();
  });
});

describe('portionLabel', () => {
  it('formats grams and servings', () => {
    expect(portionLabel({ quantity: 150, unit: 'g', grams: 150, conversionEvidence: '' })).toBe('150 g');
    expect(portionLabel({ quantity: 2, unit: '1 cup cooked', grams: 316, conversionEvidence: 'x' })).toBe('2 × 1 cup cooked (316 g)');
    expect(portionLabel({ quantity: 1, unit: '1 serving', grams: 80.25, conversionEvidence: 'x' }, { hideGrams: true })).toBe('1 serving');
  });
});

const dal: Food = {
  id: 'c:1', name: 'Dal', aliases: [], state: 'cooked', tags: [], source: { kind: 'user', name: 'You' },
  per100g: { energy_kcal: { amount: 100, kind: 'user' }, protein_g: { amount: null, kind: 'user', missingReason: 'Not entered' } },
  servings: [{ label: '1 katori', grams: 150, evidence: 'weighed', source: 'user_calibrated' }], revision: 2,
};

describe('foodFromEntry', () => {
  it('keeps the entry unit offered even if the catalog lost it', () => {
    const e = buildEntry({ food: dal, portion: makePortion(dal, 2, '1 katori'), meal: 'lunch', localDate: '2026-10-10' });
    const f = foodFromEntry(e);
    expect(f.servings[0]).toMatchObject({ label: '1 katori', grams: 150 });
    expect(f.per100g).toEqual(e.per100g);
  });
});

describe('trends', () => {
  it('builds a series with incomplete flags and distinct foods', () => {
    const e1 = buildEntry({ food: dal, portion: makePortion(dal, 100, 'g'), meal: 'lunch', localDate: '2026-10-10' });
    const e2 = buildEntry({ food: dal, portion: makePortion(dal, 50, 'g'), meal: 'dinner', localDate: '2026-10-09' });
    const dates = dateRange('2026-10-10', 3);
    expect(dates).toEqual(['2026-10-08', '2026-10-09', '2026-10-10']);
    const s = dailySeries([e1, e2], dates, 'energy_kcal');
    expect(s.map((p) => p.value)).toEqual([null, 50, 100]);
    expect(dailySeries([e1], ['2026-10-10'], 'protein_g')[0]).toMatchObject({ value: null, incomplete: true });
    expect(trendStats([e1, e2], s)).toMatchObject({ daysLogged: 2, distinctFoods: 1, average: 75 });
  });
});

describe('splitAliases', () => {
  it('splits, trims and dedupes', () => expect(splitAliases('dahi, curd ,dahi;')).toEqual(['dahi', 'curd']));
});
