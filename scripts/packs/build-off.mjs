// Open Food Facts (ODbL) -> offline country pack. Streams the full CSV export (tab-separated, gzip).
// Usage: node scripts/packs/build-off.mjs <workdir> <country, e.g. India>   (runs in CI)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { eachRow, plausible } from './lib.mjs';

// V8 keeps a split() substring pointing at its parent line; OFF lines are several KB (ingredients),
// so every kept field must be copied or the whole export stays in memory.
const own = (v) => (typeof v === 'string' && v !== '' ? Buffer.from(v, 'utf8').toString('utf8') : v);

const URL_CSV = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';

/** Detached copy of only the fields a pack needs. */
function compact(rec) {
  const o = {};
  for (const k of ['gtin', 'name', 'brand', 'kcal', 'protein', 'carb', 'fat', 'fiber', 'sugars', 'satfat', 'sodium_mg', 'basis', 'serving_qty', 'serving_label', 'ref', 'date']) o[k] = own(rec[k]);
  return o;
}

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
      world.push([scans, compact(rec)]);
      if (world.length >= worldLimit * 2.4) prune();
    }
    for (const c of hits) {
      const m = out.get(c);
      const cur = m.get(r.code);
      if (!cur || rec.date > cur.date) m.set(own(r.code), compact(rec));
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
