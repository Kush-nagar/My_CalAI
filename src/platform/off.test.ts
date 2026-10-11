import { describe, expect, it } from 'vitest';
import { lookupOff, mapOffResponse, OffError } from './off';
import { barcodeCandidates, isValidGtin } from './gtin';

const full = {
  status: 1,
  code: '8901058000290',
  product: {
    code: '8901058000290',
    product_name: 'Instant Noodles Masala',
    brands: 'Acme,Other',
    quantity: '70 g',
    serving_size: '70 g',
    serving_quantity: 70,
    serving_quantity_unit: 'g',
    nutriments: {
      'energy-kcal_100g': 440,
      proteins_100g: 9.2,
      carbohydrates_100g: 60,
      fat_100g: 17,
      'saturated-fat_100g': 8,
      sugars_100g: 2.1,
      sodium_100g: 1.12,
      calcium_100g: 0.05,
    },
  },
};

describe('mapOffResponse', () => {
  const r = mapOffResponse(full, '8901058000290', '2026-10-11T10:00:00.000Z');
  it('maps per-100 g with label kind and converts sodium g -> mg', () => {
    expect(r.food.per100g.energy_kcal).toEqual({ amount: 440, kind: 'label' });
    expect(r.food.per100g.sodium_mg?.amount).toBe(1120);
    expect(r.food.per100g.calcium_mg?.amount).toBe(50);
    expect(r.food.per100g.protein_g?.amount).toBe(9.2);
  });
  it('missing nutrients are null with a reason, never 0', () => {
    expect(r.food.per100g.fiber_g).toEqual({ amount: null, kind: 'label', missingReason: 'not reported by Open Food Facts' });
    expect(r.food.per100g.iron_mg).toBeUndefined();
  });
  it('records source, barcode and serving from package label only when unit is g', () => {
    expect(r.food.source).toMatchObject({ kind: 'off', recordId: '8901058000290', retrievedAt: '2026-10-11' });
    expect(r.food.barcode).toBe('8901058000290');
    expect(r.food.servings).toHaveLength(1);
    expect(r.food.servings[0]).toMatchObject({ grams: 70, source: 'package_label' });
    expect(r.food.name).toBe('Instant Noodles Masala (Acme)');
    expect(r.warnings.join(' ')).toMatch(/missing/);
  });
  it('no serving when unit is ml or absent', () => {
    for (const unit of ['ml', undefined]) {
      const body = { ...full, product: { ...full.product, serving_quantity_unit: unit } };
      expect(mapOffResponse(body, '8901058000290', '2026-10-11T00:00:00Z').food.servings).toEqual([]);
    }
  });
  it('rejects implausible values and zero is only kept when reported', () => {
    const body = { ...full, product: { ...full.product, nutriments: { proteins_100g: 250, fat_100g: 0 } } };
    const m = mapOffResponse(body, '8901058000290', '2026-10-11T00:00:00Z').food.per100g;
    expect(m.protein_g?.amount).toBeNull();
    expect(m.fat_g).toEqual({ amount: 0, kind: 'label' });
  });
  it('errors on not found, wrong barcode and garbage', () => {
    expect(() => mapOffResponse({ status: 0 }, '1', 'x')).toThrow(OffError);
    expect(() => mapOffResponse(full, '5449000000996', 'x')).toThrow(/different barcode/);
    expect(() => mapOffResponse(null, '1', 'x')).toThrow(OffError);
  });
});

describe('lookupOff', () => {
  it('requests only the barcode and handles a timeout/network error', async () => {
    let seen = '';
    const ok = (async (u: string) => {
      seen = u;
      return new Response(JSON.stringify(full), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await lookupOff('8901058000290', { fetchImpl: ok });
    expect(seen).toContain('/api/v2/product/8901058000290.json?fields=');
    expect(r.food.id).toBe('c:off-8901058000290');
    const down = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    await expect(lookupOff('8901058000290', { fetchImpl: down })).rejects.toMatchObject({ code: 'network' });
    const slow = ((_u: string, init: RequestInit) =>
      new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    await expect(lookupOff('8901058000290', { fetchImpl: slow, timeoutMs: 10 })).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('isValidGtin', () => {
  it('validates EAN-13, EAN-8, UPC-A check digits', () => {
    expect(isValidGtin('8901058000290')).toBe(true);
    expect(isValidGtin('5449000000996')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
    expect(isValidGtin('01234565')).toBe(true); // UPC-E form of 012345000065
    expect(barcodeCandidates('036000291452')).toContain('0036000291452');
    expect(isValidGtin('5449000000997')).toBe(false);
    expect(isValidGtin('12345')).toBe(false);
    expect(isValidGtin('abcdefgh')).toBe(false);
  });
});
