// Open Food Facts (ODbL) -> offline country pack. Streams the full CSV export (tab-separated, gzip).
// Usage: node scripts/packs/build-off.mjs <workdir> <country, e.g. India>   (runs in CI)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { eachRow, plausible } from './lib.mjs';

const URL_CSV = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';

export async function buildOff(work, countries) {
  mkdirSync(work, { recursive: true });
  const gz = join(work, 'off-products.csv.gz');
  if (!existsSync(gz)) execFileSync('curl', ['-fsSL', '--retry', '6', '--retry-all-errors', '--retry-delay', '10', '-o', gz, URL_CSV]);
  const want = countries.map((c) => c.toLowerCase());
  const out = new Map(want.map((c) => [c, new Map()]));
  let total = 0;
  await eachRow(gz, (r) => {
    total++;
    const cs = (r.countries_en || '').toLowerCase().split(',').map((s) => s.trim());
    const hits = want.filter((c) => cs.includes(c));
    if (!hits.length) return;
    const kcal = r['energy-kcal_100g'] !== '' ? r['energy-kcal_100g'] : r['energy_100g'] ? Number(r['energy_100g']) / 4.184 : '';
    const sodiumG = r.sodium_100g;
    const rec = {
      gtin: r.code, name: r.product_name || r.generic_name, brand: (r.brands || '').split(',')[0],
      kcal, protein: r.proteins_100g, carb: r.carbohydrates_100g, fat: r.fat_100g, fiber: r.fiber_100g,
      sugars: r.sugars_100g, satfat: r['saturated-fat_100g'], sodium_mg: sodiumG === '' ? '' : Number(sodiumG) * 1000,
      basis: /\bml\b|\bl\b|cl\b/i.test(r.serving_size || '') && !/\bg\b/i.test(r.serving_size || '') ? 'ml' : 'g',
      serving_qty: r.serving_quantity, serving_label: r.serving_size, ref: `off:${r.code}`,
      date: r.last_modified_t || '',
    };
    if (!rec.name || !/^\d{6,14}$/.test(r.code || '') || !plausible(rec)) return;
    for (const c of hits) {
      const m = out.get(c);
      const cur = m.get(r.code);
      if (!cur || rec.date > cur.date) m.set(r.code, rec);
    }
  }, { tsv: true, gz: true });
  console.log('off rows scanned', total);
  return Object.fromEntries([...out].map(([c, m]) => [c, [...m.values()].sort((a, b) => a.name.localeCompare(b.name))]));
}
