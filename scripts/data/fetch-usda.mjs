// Downloads USDA FoodData Central CSV releases (CC0 / public domain) and writes a compact
// extract used to curate the bundled seed. Runs in GitHub Actions (cloud dev container cannot
// reach fdc.nal.usda.gov). Usage: node scripts/data/fetch-usda.mjs <workdir> <out.json.gz>
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';

const [workdir = 'usda-work', out = 'scripts/data/raw/usda-extract.json.gz'] = process.argv.slice(2);
const PAGE = 'https://fdc.nal.usda.gov/download-datasets/';
const KINDS = { sr_legacy: /FoodData_Central_sr_legacy_food_csv_[\d-]+\.zip/g, survey: /FoodData_Central_survey_food_csv_[\d-]+\.zip/g, foundation: /FoodData_Central_foundation_food_csv_[\d-]+\.zip/g };

const NUTRIENTS = {
  1008: 'energy_kcal', 2047: 'energy_kcal_atwater_general', 2048: 'energy_kcal_atwater_specific',
  1003: 'protein_g', 1005: 'carb_g', 1004: 'fat_g', 1079: 'fiber_g', 2000: 'sugars_g', 1258: 'satfat_g',
  1093: 'sodium_mg', 1092: 'potassium_mg', 1087: 'calcium_mg', 1089: 'iron_mg', 1095: 'zinc_mg',
  1162: 'vitc_mg', 1190: 'folate_ug', 1178: 'vitb12_ug',
};
// Legacy SR nutrient numbers for the same nutrients (fallback when a CSV keys by number).
const NUTRIENT_NBR = {
  208: 'energy_kcal', 957: 'energy_kcal_atwater_general', 958: 'energy_kcal_atwater_specific',
  203: 'protein_g', 205: 'carb_g', 204: 'fat_g', 291: 'fiber_g', 269: 'sugars_g', 606: 'satfat_g',
  307: 'sodium_mg', 306: 'potassium_mg', 301: 'calcium_mg', 303: 'iron_mg', 309: 'zinc_mg',
  401: 'vitc_mg', 435: 'folate_ug', 418: 'vitb12_ug',
};

// Auxiliary CSVs differ per dataset (e.g. FNDDS has no food_category.csv): skip when absent.
async function optRows(file, onRow) {
  if (!existsSync(file)) { console.log('  (absent, skipped)', file.split('/').pop()); return; }
  await csvRows(file, onRow);
}

async function csvRows(file, onRow) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header = null, buf = '';
  for await (const line of rl) {
    buf = buf ? buf + '\n' + line : line;
    if ((buf.match(/"/g)?.length ?? 0) % 2) continue; // quoted newline: keep reading
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (q) { if (c === '"' && buf[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
    }
    cells.push(cur);
    buf = '';
    if (!header) { header = cells.map((h) => h.replace(/^\uFEFF/, '').trim()); continue; }
    onRow(Object.fromEntries(header.map((h, i) => [h, cells[i]])));
  }
}

function findCsvDir(root, name) {
  for (const e of readdirSync(root)) {
    const p = join(root, e);
    if (statSync(p).isDirectory()) { const r = findCsvDir(p, name); if (r) return r; }
    else if (e === name) return root;
  }
  return null;
}

// Transient DNS/network errors on runners (EAI_AGAIN seen in run 38176398394): retry with backoff.
async function fetchText(url, tries = 6) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (e) {
      if (i >= tries) throw e;
      console.log(`fetch attempt ${i} failed (${e.cause?.code ?? e.message}); retrying`);
      await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
}

const html = await fetchText(PAGE);
mkdirSync(workdir, { recursive: true });
const datasets = [];
const foods = new Map();
for (const [kind, re] of Object.entries(KINDS)) {
  const names = [...new Set(html.match(re) ?? [])].sort();
  if (!names.length) throw new Error(`No ${kind} CSV link found on ${PAGE}`);
  const zipName = names.at(-1);
  const url = new URL(`/fdc-datasets/${zipName}`, PAGE).href;
  const zip = join(workdir, zipName);
  execFileSync('curl', ['-fsSL', '--retry', '6', '--retry-all-errors', '--retry-delay', '10', '-o', zip, url]);
  const dir = join(workdir, kind);
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  const csv = findCsvDir(dir, 'food.csv');
  datasets.push({ kind, file: zipName, url });

  const units = new Map();
  await optRows(join(csv, 'measure_unit.csv'), (r) => units.set(r.id, r.name));
  const cats = new Map();
  await optRows(join(csv, 'food_category.csv'), (r) => cats.set(r.id, r.description));
  const wweia = new Map();
  await optRows(join(csv, 'wweia_food_category.csv'), (r) => wweia.set(r.wweia_food_category, r.wweia_food_category_description));
  const local = new Map();
  await csvRows(join(csv, 'food.csv'), (r) => {
    if (!['sr_legacy_food', 'survey_fndds_food', 'foundation_food'].includes(r.data_type)) return;
    local.set(r.fdc_id, { fdcId: Number(r.fdc_id), dataset: kind, dataType: r.data_type, desc: r.description, cat: cats.get(r.food_category_id) ?? null, published: r.publication_date, n: {}, portions: [] });
  });
  await optRows(join(csv, 'survey_fndds_food.csv'), (r) => { const f = local.get(r.fdc_id); if (f) { f.foodCode = r.food_code; f.cat = wweia.get(r.wweia_category_number ?? r.wweia_category_code) ?? f.cat; } });
  // Map by FDC nutrient id; fall back to legacy nutrient numbers (via nutrient.csv) because the
  // FNDDS CSV produced zero matches by id in the extract committed as 8a27595. Log enough to diagnose either way.
  const nbrOf = new Map();
  await optRows(join(csv, 'nutrient.csv'), (r) => nbrOf.set(r.id, r.nutrient_nbr));
  let rows = 0, matched = 0, byNbr = 0;
  const sampleIds = new Map();
  await csvRows(join(csv, 'food_nutrient.csv'), (r) => {
    rows++;
    if (rows <= 3) console.log('  food_nutrient sample', JSON.stringify(r));
    const f = local.get(r.fdc_id);
    if (!f) return;
    let code = NUTRIENTS[r.nutrient_id];
    if (!code) {
      // Via nutrient.csv when present; else the id itself may be a legacy number (FDC ids are >= 1000).
      const nbr = String(nbrOf.get(r.nutrient_id) ?? r.nutrient_id ?? '').replace(/\.0+$/, '');
      code = NUTRIENT_NBR[nbr];
      if (code) byNbr++;
    }
    if (sampleIds.size < 40) sampleIds.set(r.nutrient_id, (sampleIds.get(r.nutrient_id) ?? 0) + 1);
    if (code && r.amount !== '' && Number.isFinite(Number(r.amount))) { f.n[code] = Number(r.amount); matched++; }
  });
  console.log(`  food_nutrient rows ${rows}, mapped ${matched} (${byNbr} via nutrient_nbr); nutrient.csv entries ${nbrOf.size}; sample nutrient_ids ${[...sampleIds.keys()].slice(0, 40).join(',')}`);
  const noN = [...local.values()].filter((f) => !Object.keys(f.n).length).length;
  if (noN === local.size) throw new Error(`${kind}: no nutrients mapped for any food; see log above`);
  await optRows(join(csv, 'food_portion.csv'), (r) => {
    const f = local.get(r.fdc_id); if (!f || !(Number(r.gram_weight) > 0)) return;
    const unit = units.get(r.measure_unit_id);
    const label = [r.amount && r.amount !== '' ? r.amount : '', unit && unit !== 'undetermined' ? unit : '', r.portion_description, /^\d+$/.test(r.modifier ?? '') ? '' : r.modifier].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    f.portions.push({ label, g: Number(r.gram_weight) });
  });
  for (const [id, f] of local) foods.set(id, f);
  console.log(kind, zipName, local.size, 'foods');
}

mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
const payload = { retrievedAt: new Date().toISOString(), source: PAGE, license: 'USDA FoodData Central data are public domain (CC0 1.0); USDA requests citation.', datasets, foods: [...foods.values()] };
writeFileSync(out, gzipSync(JSON.stringify(payload)));
console.log('wrote', out, foods.size, 'foods');
