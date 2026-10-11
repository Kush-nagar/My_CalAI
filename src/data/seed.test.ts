// Validates the built seed catalog src/data/seed/foods.json (run `node scripts/data/build-seed.mjs`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURATED_FOODS } from '../../scripts/data/curation/foods.mjs';
import { TEMPLATES } from '../../scripts/data/curation/templates.mjs';
import { recipeAsFood } from '../domain/nutrition';
import { NUTRIENT_CODES, type Food, type Recipe } from '../domain/types';
import seed from './seed/foods.json';

const data = seed as unknown as { version: string; generatedAt: string; foods: Food[] };
const foods = data.foods;
const byId = new Map(foods.map((f) => [f.id, f]));
const usda = foods.filter((f) => f.source.kind === 'usda_fdc');
const templates = foods.filter((f) => f.source.kind === 'template');
const allNames = (f: Food) => [f.name, ...f.aliases].map((n) => n.toLowerCase());

describe('seed catalog shape', () => {
  it('has version, generatedAt and a few hundred foods', () => {
    expect(data.version).toMatch(/^usda-\d{4}-\d{2}-\d{2}\+curation-/);
    expect(Number.isNaN(Date.parse(data.generatedAt))).toBe(false);
    expect(usda.length).toBeGreaterThanOrEqual(250);
    expect(usda.length).toBeLessThanOrEqual(400);
  });
  it('stays small enough to bundle', () => {
    expect(readFileSync(new URL('./seed/foods.json', import.meta.url)).byteLength).toBeLessThan(1.5 * 1024 * 1024);
  });
  it('has unique ids with the right prefixes and unique display names', () => {
    expect(new Set(foods.map((f) => f.id)).size).toBe(foods.length);
    expect(new Set(foods.map((f) => f.name)).size).toBe(foods.length);
    for (const f of foods) expect(f.id).toMatch(f.source.kind === 'template' ? /^tpl:[a-z0-9-]+$/ : /^fdc:\d+$/);
  });
  it('aliases are non-empty trimmed strings, not repeating the name', () => {
    for (const f of foods) {
      expect(Array.isArray(f.aliases)).toBe(true);
      for (const a of f.aliases) {
        expect(typeof a).toBe('string');
        expect(a.trim()).toBe(a);
        expect(a.length).toBeGreaterThan(0);
      }
      expect(new Set(f.aliases).size).toBe(f.aliases.length);
      expect(f.aliases).not.toContain(f.name);
    }
  });
  it('every food has tags, a state and revision 1', () => {
    for (const f of foods) {
      expect(f.tags.length).toBeGreaterThan(0);
      expect(['raw', 'cooked', 'prepared', 'packaged', 'dry', 'unknown']).toContain(f.state);
      expect(f.revision).toBe(1);
    }
  });
});

describe('provenance and licensing', () => {
  it('every USDA food carries full CC0 source metadata', () => {
    for (const f of usda) {
      const id = f.id.slice(4);
      expect(f.source.recordId).toBe(id);
      expect(f.source.license).toBe('CC0 1.0 (public domain); citation requested');
      expect(f.source.url).toBe(`https://fdc.nal.usda.gov/food-details/${id}/nutrients`);
      expect(f.source.edition).toMatch(/^FoodData_Central_(sr_legacy|survey|foundation)_food_csv_[\d-]+\.zip$/);
      expect(f.source.retrievedAt).toBe(data.generatedAt);
      expect(f.source.name).toMatch(/^(USDA FoodData Central — (SR Legacy|Foundation)|USDA FNDDS \(US survey recipe\))$/);
      expect(f.notes).toMatch(/USDA description: "/);
    }
  });
  it('labels FNDDS dishes honestly as US survey recipes', () => {
    for (const f of usda.filter((x) => x.source.name.includes('FNDDS'))) {
      expect(f.notes).toMatch(/US standard recipe/);
      expect(f.source.edition).toMatch(/survey/);
    }
  });
  it('templates name their source, license and every ingredient', () => {
    for (const f of templates) {
      expect(f.source.name).toBe('Template recipe (calculated from listed ingredients)');
      expect(f.source.license).toMatch(/CC0/);
      expect(f.notes).toMatch(/your recipe will differ/);
      expect(f.notes).toMatch(/Ingredients: /);
    }
  });
  it('does not bundle IFCT or Open Food Facts data', () => {
    for (const f of foods) {
      const text = JSON.stringify([f.source, f.notes]);
      expect(text).not.toMatch(/IFCT|Indian Food Composition|ICMR|NIN\b|Open ?Food ?Facts/i);
      expect(['usda_fdc', 'template']).toContain(f.source.kind);
    }
  });
});

describe('nutrients', () => {
  it('reports all 15 codes; unknown is null with a reason, never NaN', () => {
    for (const f of foods) {
      expect(Object.keys(f.per100g).sort()).toEqual([...NUTRIENT_CODES].sort());
      for (const code of NUTRIENT_CODES) {
        const v = f.per100g[code]!;
        if (v.amount === null) {
          expect(v.missingReason, `${f.id} ${code}`).toBeTruthy();
        } else {
          expect(Number.isFinite(v.amount), `${f.id} ${code}`).toBe(true);
          expect(v.amount, `${f.id} ${code}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
  it('value kinds follow the dataset', () => {
    for (const f of foods) {
      const expected = f.source.kind === 'template' || f.source.name.includes('FNDDS') ? 'calculated' : 'measured';
      for (const code of NUTRIENT_CODES) expect(f.per100g[code]!.kind).toBe(expected);
    }
  });
  it('amounts are within physical bounds', () => {
    const grams = ['protein_g', 'carb_g', 'fat_g', 'fiber_g', 'sugars_g', 'satfat_g'] as const;
    for (const f of foods) {
      const e = f.per100g.energy_kcal!.amount;
      expect(e, `${f.id} energy`).not.toBeNull();
      expect(e!).toBeGreaterThanOrEqual(0);
      expect(e!).toBeLessThanOrEqual(900);
      for (const c of grams) {
        const a = f.per100g[c]!.amount;
        if (a !== null) expect(a, `${f.id} ${c}`).toBeLessThanOrEqual(100);
      }
      const fat = f.per100g.fat_g!.amount;
      const sat = f.per100g.satfat_g!.amount;
      if (fat !== null && sat !== null) expect(sat, `${f.id} satfat<=fat`).toBeLessThanOrEqual(fat + 0.5);
      expect(f.per100g.sodium_mg!.amount ?? 0, `${f.id} sodium`).toBeLessThanOrEqual(40000);
    }
  });
  it('spot-checks known USDA values (SR Legacy, as published)', () => {
    expect(byId.get('fdc:172436')!.per100g.energy_kcal!.amount).toBe(343); // pigeon peas raw
    expect(byId.get('fdc:174288')!.per100g.energy_kcal!.amount).toBe(387); // besan
    expect(byId.get('fdc:171287')!.per100g.energy_kcal!.amount).toBe(143); // egg raw
    expect(byId.get('fdc:173468')!.per100g.energy_kcal!.amount).toBe(0); // salt: reported 0 stays 0
  });
});

describe('servings', () => {
  it('have positive grams and evidence, and USDA ones cite the record', () => {
    for (const f of foods) {
      for (const s of f.servings) {
        expect(s.grams, `${f.id} ${s.label}`).toBeGreaterThan(0);
        expect(Number.isFinite(s.grams)).toBe(true);
        expect(s.evidence.trim().length).toBeGreaterThan(0);
        expect(s.label).not.toMatch(/quantity not specified|undetermined|guideline/i);
        if (f.source.kind === 'usda_fdc') {
          expect(s.source).toBe('source_data');
          expect(s.evidence).toBe(`USDA FDC ${f.source.recordId} portion: ${s.label} = ${s.grams} g`);
        }
      }
      expect(new Set(f.servings.map((s) => s.label)).size).toBe(f.servings.length);
    }
  });
});

describe('aliases do not equate different foods', () => {
  const forbidden = ['poha', 'makhana', 'jaggery', 'gur', 'tej patta', 'suran', 'jimikand', 'amla', 'chaas', 'chana dal', 'mosambi', 'ragi', 'bajra', 'basmati', 'rohu', 'hilsa', 'pomfret', 'surmai', 'bangda', 'ber', 'kulfi'];
  it('never aliases foods that have no USDA record to a different food', () => {
    for (const f of foods) for (const n of forbidden) expect(allNames(f), `${f.id} aliases ${n}`).not.toContain(n);
  });
  it('keeps distinct pulses apart', () => {
    const groups = [['toor', 'arhar'], ['moong', 'mung'], ['urad', 'black gram'], ['masoor dal'], ['chole', 'kabuli chana'], ['rajma'], ['besan']];
    for (const f of usda) {
      const names = allNames(f);
      const hit = groups.filter((g) => g.some((n) => names.includes(n)));
      expect(hit.length, `${f.id} mixes ${JSON.stringify(hit)}`).toBeLessThanOrEqual(1);
    }
  });
  it('has some native-script aliases', () => {
    const scripts = { devanagari: /\p{Script=Devanagari}/u, tamil: /\p{Script=Tamil}/u, telugu: /\p{Script=Telugu}/u, kannada: /\p{Script=Kannada}/u, bengali: /\p{Script=Bengali}/u, gujarati: /\p{Script=Gujarati}/u };
    for (const [name, re] of Object.entries(scripts)) {
      expect(foods.filter((f) => f.aliases.some((a) => re.test(a))).length, name).toBeGreaterThan(10);
    }
  });
});

describe('curation inputs', () => {
  it('every curated entry is in the seed with its curated name', () => {
    for (const e of CURATED_FOODS) expect(byId.get(`fdc:${e.fdcId}`)?.name).toBe(e.name);
    expect(usda.length).toBe(CURATED_FOODS.length);
  });
});

describe('template recipes', () => {
  const keyToId = new Map(CURATED_FOODS.filter((e) => e.key).map((e) => [e.key!, `fdc:${e.fdcId}`]));

  it('has one seed food per template spec', () => {
    expect(templates.map((t) => t.id).sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
    expect(TEMPLATES.length).toBeLessThanOrEqual(30);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s recomputes with the domain recipeAsFood()', (_id, spec) => {
    const recipe: Recipe = {
      id: spec.id,
      name: spec.name,
      aliases: spec.aliases ?? [],
      ingredients: spec.ingredients.map((i) => {
        const food = byId.get(i.foodId ?? keyToId.get(i.key!)!);
        expect(food, `${spec.id} ingredient ${i.key}`).toBeDefined();
        return { foodId: food!.id, foodName: food!.name, per100g: food!.per100g, source: food!.source, state: food!.state, grams: i.grams };
      }),
      yieldGrams: spec.yieldGrams ?? null,
      servings: spec.servings ?? null,
      revision: 1,
      updatedAt: data.generatedAt,
    };
    const ref = recipeAsFood(recipe);
    const built = byId.get(spec.id)!;
    expect(built.portionMode).toBe(ref.portionMode);
    expect(built.servings.length).toBe(ref.servings.length);
    built.servings.forEach((s, i) => expect(s.grams).toBeCloseTo(ref.servings[i].grams, 9));
    for (const code of NUTRIENT_CODES) {
      const a = built.per100g[code]!.amount;
      const b = ref.per100g[code]!.amount;
      if (b === null) expect(a, code).toBeNull();
      else expect(a, code).toBeCloseTo(b, 9);
    }
    // Ingredient list is fully disclosed in notes.
    for (const ing of recipe.ingredients) expect(built.notes).toContain(`${ing.grams} g ${ing.foodName} [${ing.foodId}]`);
  });
});
