#!/usr/bin/env node
// Builds src/data/seed/foods.json from the USDA FDC extract and the curation inputs.
// Reproducible: output depends only on the extract + curation files (generatedAt = extract retrievedAt).
// Usage: node scripts/data/build-seed.mjs [--extract scripts/data/raw/usda-extract.json.gz] [--out src/data/seed/foods.json]
// Exits 1 if any curation entry or template cannot be resolved.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildSeed } from './seed-lib.mjs';
import { CURATED_FOODS } from './curation/foods.mjs';
import { TEMPLATES } from './curation/templates.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const extractPath = opt('--extract', 'scripts/data/raw/usda-extract.json.gz');
const outPath = opt('--out', 'src/data/seed/foods.json');

const buf = readFileSync(extractPath);
const extract = JSON.parse((extractPath.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8'));
const { foods, errors } = buildSeed(extract, CURATED_FOODS, TEMPLATES);

if (errors.length) {
  console.error(`${errors.length} curation problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

const out = {
  version: `usda-${extract.retrievedAt.slice(0, 10)}+curation-${CURATED_FOODS.length}f-${TEMPLATES.length}t`,
  generatedAt: extract.retrievedAt,
  foods,
};
const json = JSON.stringify(out);
writeFileSync(outPath, json + '\n');

const by = (fn) => foods.reduce((m, f) => ((m[fn(f)] = (m[fn(f)] ?? 0) + 1), m), {});
console.log(`wrote ${outPath}: ${foods.length} foods, ${(json.length / 1024).toFixed(0)} KiB`);
console.log('by source:', by((f) => f.source.name));
console.log('by first tag:', by((f) => f.tags[0]));
