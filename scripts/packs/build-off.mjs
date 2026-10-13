// Open Food Facts (ODbL) -> offline country pack. Streams the full CSV export (tab-separated, gzip).
// Usage: node scripts/packs/build-off.mjs <workdir> <country, e.g. India>   (runs in CI)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { eachRow, plausible } from './lib.mjs';

const URL_CSV = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';

/**
 * One pass over the Open Food Facts export. Returns per-country packs plus a "world" pack of the
 * most-scanned products (excluding US-only items, which USDA Branded already covers).
 */
export async function buildOff(work, countries, worldLimit = 250_000) {
  mkdirSync(work, { recursive: true });
  const gz = join(work, 'off-products.csv.gz');
  if (!existsSync(gz)) execFileSync('curl', ['-fsSL', '--retry', '6', '--retry-all-errors', '--retry-delay', '10', '-o', gz, URL_CSV]);
  const want = countries.map((c) => c.toLowerCase());
  const out = new Map(want.map((c) => [c, new Map()]));
  let total = 0;
  // Bounded top-N by scan count: prune to worldLimit whenever the buffer doubles, so memory stays flat.
  let world = [];
  let minScans = 2;
  const prune = () => {
    world.sort((a, b) => b[0] - a[0]);
    world = world.slice(0, worldLimit * 1.2);
    minScans = Math.max(minScans, world.at(-1)?.[0] ?? 2);
  };
  await eachRow(gz, (r) => {
    total++;
    const cs = (r.countries_en || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    const hits = want.filter((c) => cs.includes(c));
    const scans = Number(r.unique_scans_n) || 0;
    const usOnly = cs.length === 1 && cs[0] === 'united states';
    if (!hits.length && (scans < minScans || usOnly)) return;
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
    if (scans >= minScans && !usOnly) {
      // Keep only what search and logging need.
      world.push([scans, { gtin: rec.gtin, name: rec.name, brand: rec.brand, kcal: rec.kcal, protein: rec.protein, carb: rec.carb, fat: rec.fat, fiber: rec.fiber, sugars: rec.sugars, satfat: rec.satfat, sodium_mg: rec.sodium_mg, basis: rec.basis, serving_qty: rec.serving_qty, serving_label: rec.serving_label, ref: rec.ref }]);
      if (world.length >= worldLimit * 2.4) prune();
    }
    for (const c of hits) {
      const m = out.get(c);
      const cur = m.get(r.code);
      if (!cur || rec.date > cur.date) m.set(r.code, rec);
    }
  }, { tsv: true, gz: true });
  prune();
  console.log('off rows scanned', total, 'world candidates kept', world.length, 'min scans', minScans);
  const seen = new Set();
  const top = [];
  for (const [, rec] of world) {
    if (seen.has(rec.gtin)) continue;
    seen.add(rec.gtin);
    top.push(rec);
    if (top.length >= worldLimit) break;
  }
  const result = Object.fromEntries([...out].map(([c, m]) => [c, [...m.values()].sort((a, b) => a.name.localeCompare(b.name))]));
  result.world = top.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
