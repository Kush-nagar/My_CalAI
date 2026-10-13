#!/usr/bin/env node
// Builds src/data/seed/global.json: every USDA FoodData Central food (SR Legacy, FNDDS, Foundation;
// CC0) that is not already in the curated seed, in a compact array form expanded by
// src/data/global.ts. Gives worldwide coverage (all cuisines, drinks, supplements, fast food).
// Usage: node scripts/data/build-global.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { NUTRIENT_CODES, inferState, mapNutrients, mapPortions } from './seed-lib.mjs';

const extract = JSON.parse(gunzipSync(readFileSync('scripts/data/raw/usda-extract.json.gz')).toString('utf8'));
const curated = new Set(JSON.parse(readFileSync('src/data/seed/foods.json', 'utf8')).foods.map((f) => f.id));
const DS = ['sr_legacy', 'survey', 'foundation'];
const sig = (n) => (n === null ? null : Number(n.toPrecision(4)));

const foods = [];
for (const f of extract.foods) {
  if (curated.has(`fdc:${f.fdcId}`)) continue;
  const ds = DS.indexOf(f.dataset);
  if (ds < 0) continue;
  const { per100g, notes } = mapNutrients(f);
  const n = NUTRIENT_CODES.map((c) => sig(per100g[c].amount));
  if (n.every((v) => v === null)) continue; // nothing usable
  const portions = mapPortions(f, 6).map((p) => [p.label, sig(p.grams)]);
  // Atwater fallback note flag (1) keeps provenance honest when 1008 energy was missing.
  const flags = notes.length ? 1 : 0;
  foods.push([f.fdcId, f.desc, ds, inferState(f.desc, f.dataset), f.cat ?? '', n, portions, flags]);
}
foods.sort((a, b) => a[1].localeCompare(b[1]));
const out = {
  version: `usda-global-${extract.retrievedAt.slice(0, 10)}`,
  retrievedAt: extract.retrievedAt,
  editions: Object.fromEntries(extract.datasets.map((d) => [d.kind, d.file])),
  nutrients: NUTRIENT_CODES,
  foods,
};
const json = JSON.stringify(out);
writeFileSync('src/data/seed/global.json', json + '\n');
console.log(`wrote src/data/seed/global.json: ${foods.length} foods, ${(json.length / 1024).toFixed(0)} KiB`);
