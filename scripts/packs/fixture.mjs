// Writes a tiny test pack into <dist>/packs for end-to-end tests (never used in production builds).
import { writeFileSync } from 'node:fs';
import { writePack } from './lib.mjs';

const dist = process.argv[2] ?? 'dist';
const rows = [
  { gtin: '0016000275287', name: 'CHEERIOS', brand: 'General Mills', kcal: 376, protein: 12.1, carb: 73.2, fat: 6.7, fiber: 10, sugars: 4.4, satfat: 1.3, sodium_mg: 497, basis: 'g', serving_qty: 28, serving_label: '1 cup', ref: 'fdc:900001' },
  { gtin: '0072030014289', name: 'GREEK YOGURT, PLAIN', brand: 'Test Dairy', kcal: 97, protein: 9, carb: 3.6, fat: 5, basis: 'g', serving_qty: 170, serving_label: '1 container', ref: 'fdc:900002' },
  { gtin: '', name: 'Whey Protein Isolate, Vanilla', brand: 'Muscle Co', kcal: 370, protein: 84, carb: 6, fat: 1.5, basis: 'g', serving_qty: 30, serving_label: '1 scoop', ref: 'fdc:900003' },
];
const p = writePack({
  id: 'usda-branded', name: 'USDA branded foods (test fixture)', version: 'fixture', rows,
  description: 'Test fixture.', source: 'USDA FoodData Central — Branded Foods', license: 'CC0 1.0',
  attribution: 'Test fixture.', url: 'https://fdc.nal.usda.gov/', outDir: `${dist}/packs/usda-branded`,
});
writeFileSync(`${dist}/packs/manifest.json`, JSON.stringify({ generatedAt: 'fixture', packs: [p] }) + '\n');
console.log('fixture pack written', p.rows);
