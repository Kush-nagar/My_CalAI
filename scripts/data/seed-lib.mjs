// Pure helpers that turn the USDA FDC extract + curation inputs into seed Food records.
// Used by build-seed.mjs (CLI) and by the vitest suite. No I/O here.
// Contract: src/domain/types.ts (Food, NutrientMap, ServingConversion).

export const NUTRIENT_CODES = [
  'energy_kcal', 'protein_g', 'carb_g', 'fat_g', 'fiber_g', 'sugars_g', 'satfat_g', 'sodium_mg',
  'potassium_mg', 'calcium_mg', 'iron_mg', 'zinc_mg', 'vitc_mg', 'folate_ug', 'vitb12_ug',
];

export const LICENSE = 'CC0 1.0 (public domain); citation requested';
export const TEMPLATE_LICENSE = 'Calculated from USDA FoodData Central values (CC0 1.0); ingredient list by the Thali curator';

export const DATASET_LABEL = {
  sr_legacy: 'SR Legacy',
  foundation: 'Foundation',
  survey: 'FNDDS',
};

export const FNDDS_SOURCE_NOTE =
  'Source: USDA FNDDS (US survey recipe). Values reflect a US standard recipe; home and restaurant versions in India vary widely in oil, ghee, salt and ingredients.';

/** USDA dataset kind -> value kind for our NutrientValue. */
export function valueKind(dataset) {
  return dataset === 'survey' ? 'calculated' : 'measured';
}

/**
 * Map USDA nutrient amounts (n) to a full 15-code NutrientMap.
 * Every code is present: a number when USDA reports one (including a reported 0), else null
 * with a reason. Foundation foods often lack 1008 energy: fall back to Atwater specific (2048),
 * then general (2047), and say so.
 */
export function mapNutrients(food) {
  const kind = valueKind(food.dataset);
  const label = DATASET_LABEL[food.dataset] ?? food.dataset;
  const out = {};
  const notes = [];
  for (const code of NUTRIENT_CODES) {
    let v = food.n?.[code];
    if (code === 'energy_kcal' && !isNum(v)) {
      if (isNum(food.n?.energy_kcal_atwater_specific)) {
        v = food.n.energy_kcal_atwater_specific;
        notes.push('Energy is USDA "Energy (Atwater Specific Factors)" (nutrient 2048); USDA reports no 1008 energy value for this food.');
      } else if (isNum(food.n?.energy_kcal_atwater_general)) {
        v = food.n.energy_kcal_atwater_general;
        notes.push('Energy is USDA "Energy (Atwater General Factors)" (nutrient 2047); USDA reports no 1008 energy value for this food.');
      }
    }
    out[code] = isNum(v)
      ? { amount: v, kind }
      : { amount: null, kind, missingReason: `Not reported by USDA ${label}` };
  }
  return { per100g: out, notes };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const JUNK_LABEL = /quantity not specified|not specified|undetermined|^\s*$|^[\d.\s/]+$|guideline amount|surface inch|cubic inch|\byields?\b|bone and skin$|brownulated|NLEA|^1 (?:g|gram)s?$/i;

/** Human-friendly label cleanup; returns null to drop the portion. */
export function cleanPortionLabel(label) {
  if (typeof label !== 'string') return null;
  let l = label.replace(/\s+/g, ' ').trim();
  // "1 1 cup" style duplication from amount + description
  l = l.replace(/^(\d+(?:\.\d+)?) \1 /, '$1 ');
  // Normalise "1.0 cup" -> "1 cup"; drop trailing FNDDS portion codes ("1 cup 10205")
  l = l.replace(/^(\d+)\.0\b/, '$1').replace(/ \d{5}$/, '');
  if (JUNK_LABEL.test(l)) return null;
  if (l.length > 60) return null;
  return l;
}

/**
 * USDA food_portion gram weights -> ServingConversion[]. Drops junk/undetermined labels, duplicates
 * and non-positive weights; keeps at most `max`, preserving USDA order.
 */
export function mapPortions(food, max = 8, drop = null) {
  const out = [];
  const seen = new Set();
  const dropRe = drop ? new RegExp(drop, 'i') : null;
  for (const p of food.portions ?? []) {
    const label = cleanPortionLabel(p.label);
    if (label && dropRe?.test(label)) continue;
    const g = Number(p.g);
    if (!label || !(g > 0) || !Number.isFinite(g)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label,
      grams: g,
      evidence: `USDA FDC ${food.fdcId} portion: ${label} = ${g} g`,
      source: 'source_data',
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Guess FoodState from USDA wording when curation does not set it. */
export function inferState(desc, dataset) {
  const d = desc.toLowerCase();
  if (/\b(cooked|boiled|roasted|baked|fried|steamed|stewed|grilled|braised|broiled|toasted|scrambled|poached)\b/.test(d)) return 'cooked';
  if (/\braw\b/.test(d)) return 'raw';
  if (/\b(dried|dry|flour|meal|powder|ground)\b/.test(d)) return 'dry';
  if (dataset === 'survey') return 'prepared';
  return 'unknown';
}

/** Find the USDA record for a curation entry. Exact fdcId, else exact description within dataset. */
export function indexExtract(extract) {
  const byId = new Map();
  const byDesc = new Map();
  for (const f of extract.foods) {
    byId.set(f.fdcId, f);
    const k = `${f.dataset}|${f.desc.toLowerCase()}`;
    if (!byDesc.has(k)) byDesc.set(k, []);
    byDesc.get(k).push(f);
  }
  return {
    resolve(entry) {
      if (entry.fdcId != null) {
        const f = byId.get(Number(entry.fdcId));
        if (!f) return { error: `fdcId ${entry.fdcId} not in extract` };
        if (entry.dataset && f.dataset !== entry.dataset) return { error: `fdcId ${entry.fdcId} is ${f.dataset}, expected ${entry.dataset}` };
        if (entry.desc && entry.desc.toLowerCase() !== f.desc.toLowerCase()) return { error: `fdcId ${entry.fdcId} is "${f.desc}", curation expects "${entry.desc}"` };
        return { food: f };
      }
      const hits = byDesc.get(`${entry.dataset}|${String(entry.desc).toLowerCase()}`) ?? [];
      if (hits.length === 0) return { error: `no ${entry.dataset} food with description "${entry.desc}"` };
      if (hits.length > 1) {
        // Foundation sometimes has several samples; take the latest published.
        hits.sort((a, b) => String(b.published).localeCompare(String(a.published)) || b.fdcId - a.fdcId);
      }
      return { food: hits[0] };
    },
  };
}

/** Build one seed Food from a USDA record and its curation entry. */
export function buildFood(usda, entry, meta) {
  const ds = DATASET_LABEL[usda.dataset];
  if (!ds) throw new Error(`Unknown dataset ${usda.dataset}`);
  const edition = meta.datasets.find((d) => d.kind === usda.dataset)?.file;
  const { per100g, notes: nutrientNotes } = mapNutrients(usda);
  const notes = [];
  if (usda.dataset === 'survey') notes.push(FNDDS_SOURCE_NOTE);
  if (entry.notes) notes.push(entry.notes);
  notes.push(...nutrientNotes);
  notes.push(`USDA description: "${usda.desc}"${usda.foodCode ? ` (FNDDS food code ${usda.foodCode})` : ''}.`);
  const tags = [...new Set([...(entry.tags ?? []), `usda-${usda.dataset.replace('_', '-')}`])];
  return {
    id: `fdc:${usda.fdcId}`,
    name: entry.name,
    aliases: [...new Set((entry.aliases ?? []).map((a) => a.trim()).filter(Boolean))].filter((a) => a !== entry.name),
    state: entry.state ?? (() => {
      const inferred = inferState(usda.desc, usda.dataset);
      return inferred === 'unknown' ? entry.defaultState ?? 'unknown' : inferred;
    })(),
    tags,
    source: {
      kind: 'usda_fdc',
      name: usda.dataset === 'survey' ? 'USDA FNDDS (US survey recipe)' : `USDA FoodData Central — ${ds}`,
      recordId: String(usda.fdcId),
      edition,
      license: LICENSE,
      retrievedAt: meta.retrievedAt,
      url: `https://fdc.nal.usda.gov/food-details/${usda.fdcId}/nutrients`,
    },
    per100g,
    servings: entry.noServings ? [] : mapPortions(usda, 8, entry.dropPortions),
    notes: notes.join(' '),
    portionMode: 'any',
    revision: 1,
  };
}

// ---- Template recipes ------------------------------------------------------------------------
// Mirrors calculateRecipe()/recipeAsFood() in src/domain/nutrition.ts for the no-yield and
// weighed-yield paths. src/data/seed.test.ts recomputes every template with the real domain code.

function scale(per100g, grams) {
  const values = {};
  const incomplete = [];
  for (const code of NUTRIENT_CODES) {
    const v = per100g[code];
    if (v && v.amount !== null && Number.isFinite(v.amount)) values[code] = (v.amount * grams) / 100;
    else incomplete.push(code);
  }
  return { values, incomplete };
}

function toPer100g(values, incomplete, grams) {
  const out = {};
  for (const code of NUTRIENT_CODES) {
    const v = values[code];
    out[code] = v !== undefined && !incomplete.has(code)
      ? { amount: (v * 100) / grams, kind: 'calculated' }
      : { amount: null, kind: 'calculated', missingReason: 'One or more ingredients lack this value' };
  }
  return out;
}

const r1 = (n) => Math.round(n * 10) / 10;

export function buildTemplate(tpl, foodsById) {
  if (!tpl.id.startsWith('tpl:')) throw new Error(`Template id must start with tpl: (${tpl.id})`);
  if (!tpl.ingredients?.length) throw new Error(`${tpl.id}: no ingredients`);
  const values = {};
  const incomplete = new Set();
  let rawGrams = 0;
  const lines = [];
  for (const ing of tpl.ingredients) {
    const f = foodsById.get(ing.foodId);
    if (!f) throw new Error(`${tpl.id}: ingredient ${ing.foodId} not in seed`);
    if (!(ing.grams > 0)) throw new Error(`${tpl.id}: bad grams for ${ing.foodId}`);
    const t = scale(f.per100g, ing.grams);
    for (const [k, v] of Object.entries(t.values)) values[k] = (values[k] ?? 0) + v;
    for (const k of t.incomplete) incomplete.add(k);
    rawGrams += ing.grams;
    lines.push(`${ing.grams} g ${f.name} [${f.id}]`);
  }
  const yieldGrams = tpl.yieldGrams ?? null;
  const servings = tpl.servings ?? null;
  let per100g;
  let portionMode = 'any';
  const servingsOut = [];
  if (yieldGrams !== null) {
    per100g = toPer100g(values, incomplete, yieldGrams);
    if (servings) {
      servingsOut.push({
        label: tpl.servingLabel ?? '1 serving',
        grams: yieldGrams / servings,
        evidence: `Template assumption: cooked yield ${r1(yieldGrams)} g ÷ ${servings} servings`,
        source: 'source_data',
      });
    }
  } else {
    per100g = toPer100g(values, incomplete, rawGrams);
    portionMode = 'servings_only';
    const n = servings ?? 1;
    servingsOut.push({
      label: servings ? (tpl.servingLabel ?? '1 serving') : 'Whole batch',
      grams: rawGrams / n,
      evidence: servings
        ? `Template: 1/${n} of the batch (cooked weight not stated; gram figure is raw ingredient weight)`
        : 'Template: whole batch (cooked weight not stated)',
      source: 'source_data',
    });
  }
  const notes = [
    'Template recipe calculated from the listed ingredients with USDA FoodData Central values; your recipe will differ (oil, salt, water and proportions vary). Use your own recipe for accuracy.',
    `Ingredients: ${lines.join('; ')}.`,
    yieldGrams !== null
      ? `Cooked-yield assumption: ${r1(yieldGrams)} g for the whole batch${servings ? `, ${servings} servings` : ''}.`
      : `No cooked-yield assumption (cooked weight varies with water and cooking time), so it is logged by serving only${servings ? `: batch = ${servings} servings` : ''}.`,
    tpl.method ? `Method: ${tpl.method}` : '',
    tpl.notes ?? '',
  ].filter(Boolean);
  return {
    id: tpl.id,
    name: tpl.name,
    aliases: [...new Set(tpl.aliases ?? [])].filter((a) => a !== tpl.name),
    state: 'prepared',
    tags: [...new Set([...(tpl.tags ?? []), 'dish', 'template'])],
    source: { kind: 'template', name: 'Template recipe (calculated from listed ingredients)', recordId: tpl.id, license: TEMPLATE_LICENSE },
    per100g,
    servings: servingsOut,
    notes: notes.join(' '),
    portionMode,
    revision: 1,
  };
}

/** Whole build: curation entries + templates -> { foods, errors }. */
export function buildSeed(extract, entries, templates) {
  const idx = indexExtract(extract);
  const errors = [];
  const foods = [];
  const ids = new Set();
  for (const entry of entries) {
    const r = idx.resolve(entry);
    if (r.error) { errors.push(`${entry.name}: ${r.error}`); continue; }
    const food = buildFood(r.food, entry, extract);
    if (ids.has(food.id)) { errors.push(`${entry.name}: duplicate ${food.id}`); continue; }
    ids.add(food.id);
    foods.push(food);
  }
  // Templates reference curation keys or fdc ids. Resolve keys first.
  const byKey = new Map();
  entries.forEach((e) => { if (e.key) { const r = idx.resolve(e); if (r.food) byKey.set(e.key, `fdc:${r.food.fdcId}`); } });
  const byId = new Map(foods.map((f) => [f.id, f]));
  for (const tpl of templates ?? []) {
    try {
      const resolved = { ...tpl, ingredients: tpl.ingredients.map((i) => ({ ...i, foodId: i.foodId ?? byKey.get(i.key) ?? `missing:${i.key}` })) };
      const t = buildTemplate(resolved, byId);
      if (ids.has(t.id)) throw new Error(`duplicate ${t.id}`);
      ids.add(t.id);
      foods.push(t);
    } catch (e) {
      errors.push(`${tpl.id}: ${e.message}`);
    }
  }
  return { foods, errors, keyToId: byKey };
}
