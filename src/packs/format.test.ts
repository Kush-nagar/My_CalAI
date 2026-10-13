import { describe, expect, it } from 'vitest';
import { scaleNutrients } from '../domain/nutrition';
import { makePortion, unitOptions } from '../domain/portion';
import { COLUMNS, PackIndex, rowToFood } from './format';

const H = COLUMNS.join('\t');
const line = (...c: (string | number)[]) => c.join('\t');
const shard = [
  H,
  line('0016000275287', 'CHEERIOS', 'General Mills', 376, 12.1, 73.2, 6.7, 10, 4.4, 1.3, 497, 'g', 28, '1 cup', 'fdc:1'),
  line('041196910759', 'Whole Milk', 'Store Brand', 61, 3.2, 4.8, 3.3, '', 5, 1.9, 43, 'ml', 240, '1 cup', 'fdc:2'),
  line('', 'Protein Powder, Vanilla Whey', 'Muscle Co', 380, 75, 8, 5, '', 3, '', 300, 'g', 32, '1 scoop', 'fdc:3'),
  line('8901262150187', 'Amul Masti Dahi', 'Amul', '', 3.1, 4.4, 3.1, '', '', '', '', 'g', '', '', 'off:8901262150187'),
  'broken line without tabs',
].join('\n');

function idx() {
  const p = new PackIndex();
  p.addShard('usda-branded', shard);
  p.build();
  return p;
}

describe('food packs', () => {
  it('parses shards and skips malformed lines', () => {
    expect(idx().size).toBe(4);
    expect(() => new PackIndex().addShard('x', 'not\ta\theader\n')).toThrow();
  });

  it('searches with all words, preferring whole words', () => {
    const p = idx();
    expect(p.search('whey protein').map((r) => r.ref)).toEqual(['fdc:3']);
    expect(p.search('cheerios')[0].ref).toBe('fdc:1');
    expect(p.search('general mills')[0].ref).toBe('fdc:1'); // brand is searchable
    expect(p.search('dahi amul')[0].ref).toBe('off:8901262150187');
    expect(p.search('pizza')).toEqual([]);
  });

  it('finds barcodes across UPC/EAN leading-zero forms', () => {
    const p = idx();
    expect(p.byBarcode('016000275287')?.ref).toBe('fdc:1');
    expect(p.byBarcode('0016000275287')?.ref).toBe('fdc:1');
    expect(p.byBarcode('999')).toBeNull();
  });

  it('turns a row into a food with label values; blanks stay unknown', () => {
    const f = rowToFood(idx().byBarcode('8901262150187')!);
    expect(f.per100g.protein_g?.amount).toBe(3.1);
    expect(f.per100g.energy_kcal?.amount).toBeNull();
    expect(f.source.kind).toBe('usda_fdc');
  });

  it('serving from the label scales correctly', () => {
    const f = rowToFood(idx().search('cheerios')[0]);
    expect(f.name).toBe('Cheerios — General Mills');
    const u = unitOptions(f).find((o) => o.unit.startsWith('1 serving'))!;
    const kcal = scaleNutrients(f.per100g, makePortion(f, 1, u.unit).grams).values.energy_kcal!;
    expect(kcal).toBeCloseTo(376 * 0.28);
  });

  it('per-100 ml products are logged by ml servings, never as grams', () => {
    const f = rowToFood(idx().search('whole milk')[0]);
    expect(f.portionMode).toBe('servings_only');
    expect(unitOptions(f).map((o) => o.unit)).toEqual(['100 ml', '1 serving (1 cup, 240 ml)']);
    const kcal = scaleNutrients(f.per100g, makePortion(f, 1, '1 serving (1 cup, 240 ml)').grams).values.energy_kcal!;
    expect(kcal).toBeCloseTo(61 * 2.4);
  });

  it('search stays fast on a large pack', () => {
    const rows = [H];
    for (let i = 0; i < 200_000; i++) rows.push(line(String(10_000_000 + i), `Product ${i} crunchy granola bar`, `Brand ${i % 500}`, 400, 8, 60, 14, 5, 20, 3, 200, 'g', 40, '1 bar', `fdc:${i}`));
    const p = new PackIndex();
    p.addShard('usda-branded', rows.join('\n'));
    p.build();
    const t = performance.now();
    const r = p.search('granola 199999');
    expect(r[0]?.ref).toBe('fdc:199999');
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe('fold', () => {
  it('keeps length, removes accents and blanks non-Latin', async () => {
    const { fold } = await import('./format');
    for (const s of ['Nestlé Crème', 'İstanbul simit', 'नमकीन Bhujia', 'Pão 🍞 de queijo', 'ÆØÅ ß']) expect(fold(s).length).toBe(s.length);
    expect(fold('Nestlé Crème')).toBe('nestle creme');
  });
});
