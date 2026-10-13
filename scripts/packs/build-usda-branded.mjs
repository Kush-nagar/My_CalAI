// USDA FoodData Central Branded Foods (CC0) -> offline pack public/packs/usda-branded/.
// Usage: node scripts/packs/build-usda-branded.mjs <workdir>   (needs network to fdc.nal.usda.gov; runs in CI)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { eachRow, plausible } from './lib.mjs';

const work = process.argv[2] ?? 'packs-work';
mkdirSync(work, { recursive: true });
const PAGE = 'https://fdc.nal.usda.gov/download-datasets/';

async function text(url) {
  for (let i = 1; ; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return await r.text(); }
    catch (e) { if (i >= 6) throw e; await new Promise((s) => setTimeout(s, 5000 * i)); }
  }
}
function findDir(root, name) {
  for (const e of readdirSync(root)) {
    const p = join(root, e);
    if (statSync(p).isDirectory()) { const r = findDir(p, name); if (r) return r; }
    else if (e === name) return root;
  }
  return null;
}

export async function buildUsdaBranded() {
  const html = await text(PAGE);
  const zips = [...new Set(html.match(/FoodData_Central_branded_food_csv_[\d-]+\.zip/g) ?? [])].sort();
  if (!zips.length) throw new Error('No branded CSV link found');
  const zipName = zips.at(-1);
  const zip = join(work, zipName);
  if (!existsSync(zip)) execFileSync('curl', ['-fsSL', '--retry', '6', '--retry-all-errors', '--retry-delay', '10', '-o', zip, new URL(`/fdc-datasets/${zipName}`, PAGE).href]);
  const dir = join(work, 'branded');
  if (!existsSync(dir)) execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  const csv = findDir(dir, 'branded_food.csv');
  console.log('branded release', zipName, csv);

  const prod = new Map(); // fdc_id -> record
  await eachRow(join(csv, 'branded_food.csv'), (r) => {
    if (r.discontinued_date) return;
    const unit = (r.serving_size_unit || '').toLowerCase();
    const basis = unit === 'ml' || unit === 'mlt' ? 'ml' : unit === 'g' || unit === 'grm' || unit === '' ? 'g' : null;
    if (!basis) return;
    prod.set(r.fdc_id, {
      gtin: r.gtin_upc, brand: r.brand_name || r.brand_owner, basis,
      serving_qty: r.serving_size, serving_label: r.household_serving_fulltext,
      date: r.available_date || r.modified_date || '', ref: `fdc:${r.fdc_id}`,
      name: '', kcal: '', protein: '', carb: '', fat: '', fiber: '', sugars: '', satfat: '', sodium_mg: '',
    });
  });
  console.log('branded rows', prod.size);
  await eachRow(join(csv, 'food.csv'), (r) => { const p = prod.get(r.fdc_id); if (p) p.name = r.description; });
  const NUT = { 1008: 'kcal', 1003: 'protein', 1005: 'carb', 1004: 'fat', 1079: 'fiber', 2000: 'sugars', 1258: 'satfat', 1093: 'sodium_mg' };
  let kj = 0;
  await eachRow(join(csv, 'food_nutrient.csv'), (r) => {
    const p = prod.get(r.fdc_id); if (!p) return;
    const k = NUT[r.nutrient_id];
    if (k && r.amount !== '') p[k] = r.amount;
    else if (r.nutrient_id === '1062' && p.kcal === '' && r.amount !== '') { p.kcalFromKj = Number(r.amount) / 4.184; kj++; }
  });
  console.log('kJ-only energy converted', kj);

  // Latest record per GTIN (products are re-submitted over the years).
  const byGtin = new Map();
  for (const p of prod.values()) {
    if (p.kcal === '' && p.kcalFromKj) p.kcal = p.kcalFromKj;
    if (!p.name || !plausible(p)) continue;
    const key = (p.gtin || '').replace(/\D/g, '').replace(/^0+/, '') || p.ref;
    const cur = byGtin.get(key);
    if (!cur || p.date > cur.date) byGtin.set(key, p);
  }
  const rows = [...byGtin.values()].sort((a, b) => a.name.localeCompare(b.name));
  console.log('usda branded kept', rows.length);
  return { rows, version: zipName.replace(/^FoodData_Central_branded_food_csv_|\.zip$/g, '') };
}
