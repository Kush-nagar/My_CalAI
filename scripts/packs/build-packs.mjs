// Builds all offline food packs into public/packs/ and writes public/packs/manifest.json.
// Each source is optional: if one fails (network), the others still ship. Usage: node scripts/packs/build-packs.mjs <workdir>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { writePack } from './lib.mjs';
import { buildUsdaBranded } from './build-usda-branded.mjs';
import { buildOff } from './build-off.mjs';

const work = process.argv[2] ?? 'packs-work';
const packs = [];
const stats = {};

try {
  const { rows, version } = await buildUsdaBranded();
  rmSync('public/packs/usda-branded', { recursive: true, force: true });
  packs.push(writePack({
    id: 'usda-branded', name: 'USDA branded foods (US packaged products)', version, rows,
    description: 'Packaged and restaurant-chain products sold in the US, with the nutrition label data manufacturers submit to USDA. Includes barcodes.',
    source: 'USDA FoodData Central — Branded Foods', license: 'CC0 1.0 (public domain); USDA asks to be cited',
    attribution: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov.',
    url: 'https://fdc.nal.usda.gov/', outDir: 'public/packs/usda-branded',
  }));
  stats.usda = rows.length;
} catch (e) { console.error('USDA branded pack failed:', e.message); stats.usdaError = e.message; }

try {
  const byCountry = await buildOff(work, ['India']);
  const rows = byCountry.india;
  rmSync('public/packs/off-india', { recursive: true, force: true });
  packs.push(writePack({
    id: 'off-india', name: 'Open Food Facts — India packaged foods', version: new Date().toISOString().slice(0, 10), rows,
    description: 'Packaged foods sold in India (e.g. Amul, Haldiram’s, Britannia), contributed by the Open Food Facts community. Quality varies: check against the label.',
    source: 'Open Food Facts', license: 'Open Database License (ODbL) 1.0; database contents under the Database Contents License',
    attribution: '© Open Food Facts contributors (openfoodfacts.org). This derived database is made available under the ODbL.',
    url: 'https://world.openfoodfacts.org/', outDir: 'public/packs/off-india',
  }));
  stats.offIndia = rows.length;
  rmSync('public/packs/off-world', { recursive: true, force: true });
  packs.push(writePack({
    id: 'off-world', name: 'Open Food Facts — popular products worldwide', version: new Date().toISOString().slice(0, 10), rows: byCountry.world,
    description: 'The most-scanned packaged foods from around the world (UK, Europe, Canada, Australia, the Middle East and more), contributed by the Open Food Facts community. Quality varies: check against the label.',
    source: 'Open Food Facts', license: 'Open Database License (ODbL) 1.0; database contents under the Database Contents License',
    attribution: '© Open Food Facts contributors (openfoodfacts.org). This derived database is made available under the ODbL.',
    url: 'https://world.openfoodfacts.org/', outDir: 'public/packs/off-world',
  }));
  stats.offWorld = byCountry.world.length;
} catch (e) { console.error('Open Food Facts pack failed:', e.message); stats.offError = e.message; }

mkdirSync('public/packs', { recursive: true });
writeFileSync('public/packs/manifest.json', JSON.stringify({ generatedAt: new Date().toISOString(), packs }, null, 1) + '\n');
writeFileSync('scripts/packs/last-build.json', JSON.stringify({ at: new Date().toISOString(), stats, packs: packs.map((p) => ({ id: p.id, rows: p.rows, bytes: p.files.reduce((s, f) => s + f.bytes, 0), files: p.files.length })) }, null, 1) + '\n');
console.log(JSON.stringify(stats));
