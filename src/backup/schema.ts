// Shape and bounds validation for records read from a backup file. Pure functions, no DB access.
// Unknown extra fields are tolerated (forward compatibility) but every known field is checked,
// and the generic tree walk rejects prototype-pollution keys, deep nesting and huge strings.
import type { Food, MealEntry, Recipe, Settings } from '../domain/types';
import { NUTRIENT_CODES } from '../domain/types';

export const LIMITS = {
  maxDepth: 16,
  maxString: 20_000,
  name: 200,
  shortText: 500,
  note: 2_000,
  notes: 5_000,
  method: 20_000,
  listItems: 200,
  ingredients: 500,
  nutrient: 100_000, // per 100 g, any unit (sodium mg tops out ~39 000)
  total: 100_000_000, // absolute totals for one entry
  grams: 100_000, // 100 kg
  recipeGrams: 1_000_000,
  revision: 1_000_000_000,
  favorites: 10_000,
  maxErrors: 25,
} as const;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.\-]{0,127}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const NUTRIENT_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const SUMMARY_CODES: readonly string[] = NUTRIENT_CODES;

const VALUE_KINDS = ['measured', 'label', 'calculated', 'user', 'estimated'];
const SOURCE_KINDS = ['usda_fdc', 'off', 'label', 'user', 'recipe', 'template'];
const FOOD_STATES = ['raw', 'cooked', 'prepared', 'packaged', 'dry', 'unknown'];
const SERVING_SOURCES = ['source_data', 'user_calibrated', 'package_label'];
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Error collector with a path prefix and a cap so a hostile file cannot flood the UI. */
export class Errs {
  readonly list: string[] = [];
  push(msg: string) {
    if (this.list.length < LIMITS.maxErrors) this.list.push(msg);
    else if (this.list.length === LIMITS.maxErrors) this.list.push('…more problems not shown.');
  }
  get ok() {
    return this.list.length === 0;
  }
}

/**
 * Iterative walk over parsed JSON: no forbidden keys, bounded depth, bounded strings.
 * `bigStringOk(path)` names the exact paths exempt from the string cap (base64 payloads).
 */
export function walkTree(root: unknown, where: string, e: Errs, bigStringOk: (path: string) => boolean = () => false): void {
  const stack: [unknown, number, string][] = [[root, 0, where]];
  while (stack.length) {
    const [v, depth, path] = stack.pop()!;
    if (depth > LIMITS.maxDepth) {
      e.push(`${path}: nested too deeply.`);
      return;
    }
    if (typeof v === 'string') {
      if (v.length > LIMITS.maxString && !bigStringOk(path)) e.push(`${path}: text is too long.`);
    } else if (typeof v === 'number') {
      if (!Number.isFinite(v)) e.push(`${path}: invalid number.`);
    } else if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) stack.push([v[i], depth + 1, `${path}[${i}]`]);
    } else if (v !== null && typeof v === 'object') {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
        e.push(`${path}: unexpected value.`);
        continue;
      }
      for (const k of Object.keys(v)) {
        if (FORBIDDEN_KEYS.has(k)) {
          e.push(`${path}: forbidden key "${k}".`);
          return;
        }
        stack.push([(v as Record<string, unknown>)[k], depth + 1, `${path}.${k}`]);
      }
    } else if (v !== null && typeof v !== 'boolean') {
      e.push(`${path}: unexpected value.`);
    }
  }
}

// ---- primitive checks -------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

function str(e: Errs, p: string, v: unknown, max: number, opts: { optional?: boolean; min?: number; re?: RegExp } = {}) {
  if (v === undefined && opts.optional) return;
  if (typeof v !== 'string') return e.push(`${p}: expected text.`);
  if (v.length < (opts.min ?? 0) || v.length > max) return e.push(`${p}: text length out of range.`);
  if (opts.re && !opts.re.test(v)) e.push(`${p}: invalid format.`);
}

function num(e: Errs, p: string, v: unknown, min: number, max: number, opts: { optional?: boolean; nullable?: boolean; int?: boolean; gtMin?: boolean } = {}) {
  if (v === undefined && opts.optional) return;
  if (v === null && opts.nullable) return;
  if (typeof v !== 'number' || !Number.isFinite(v)) return e.push(`${p}: expected a number.`);
  if (opts.int && !Number.isInteger(v)) return e.push(`${p}: expected a whole number.`);
  if (v < min || v > max || (opts.gtMin && v === min)) e.push(`${p}: number out of range.`);
}

function oneOf(e: Errs, p: string, v: unknown, allowed: readonly string[], optional = false) {
  if (v === undefined && optional) return;
  if (typeof v !== 'string' || !allowed.includes(v)) e.push(`${p}: unexpected value.`);
}

function bool(e: Errs, p: string, v: unknown, optional = false) {
  if (v === undefined && optional) return;
  if (typeof v !== 'boolean') e.push(`${p}: expected true/false.`);
}

function iso(e: Errs, p: string, v: unknown, optional = false) {
  if (v === undefined && optional) return;
  if (typeof v !== 'string' || !ISO_RE.test(v) || Number.isNaN(Date.parse(v))) e.push(`${p}: invalid timestamp.`);
}

function localDate(e: Errs, p: string, v: unknown) {
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) e.push(`${p}: invalid date.`);
}

function strList(e: Errs, p: string, v: unknown, maxItems: number, maxLen: number) {
  if (!Array.isArray(v) || v.length > maxItems) return e.push(`${p}: expected a list (max ${maxItems}).`);
  v.forEach((s, i) => str(e, `${p}[${i}]`, s, maxLen));
}

// ---- domain records -----------------------------------------------------------------------

function sourceRef(e: Errs, p: string, v: unknown) {
  if (!isObj(v)) return e.push(`${p}: missing source.`);
  oneOf(e, `${p}.kind`, v.kind, SOURCE_KINDS);
  str(e, `${p}.name`, v.name, LIMITS.shortText);
  str(e, `${p}.recordId`, v.recordId, LIMITS.shortText, { optional: true });
  str(e, `${p}.edition`, v.edition, LIMITS.shortText, { optional: true });
  str(e, `${p}.license`, v.license, LIMITS.shortText, { optional: true });
  str(e, `${p}.retrievedAt`, v.retrievedAt, 64, { optional: true });
  // Only web links: a "javascript:" or "data:" URL must never reach an href.
  str(e, `${p}.url`, v.url, 2_000, { optional: true, re: /^https?:\/\/[^\s]+$/i });
}

function nutrientMap(e: Errs, p: string, v: unknown) {
  if (!isObj(v)) return e.push(`${p}: expected nutrient map.`);
  for (const [k, nv] of Object.entries(v)) {
    const q = `${p}.${k}`;
    if (!NUTRIENT_KEY_RE.test(k)) {
      e.push(`${q}: unknown nutrient key.`);
      continue;
    }
    if (!isObj(nv)) {
      e.push(`${q}: expected nutrient value.`);
      continue;
    }
    num(e, `${q}.amount`, nv.amount, 0, LIMITS.nutrient, { nullable: true });
    oneOf(e, `${q}.kind`, nv.kind, VALUE_KINDS);
    str(e, `${q}.missingReason`, nv.missingReason, LIMITS.shortText, { optional: true });
  }
}

export function checkFood(e: Errs, p: string, v: unknown): v is Food {
  const before = e.list.length;
  if (!isObj(v)) {
    e.push(`${p}: expected a food record.`);
    return false;
  }
  str(e, `${p}.id`, v.id, 128, { re: ID_RE });
  str(e, `${p}.name`, v.name, LIMITS.name, { min: 1 });
  strList(e, `${p}.aliases`, v.aliases, LIMITS.listItems, LIMITS.name);
  oneOf(e, `${p}.state`, v.state, FOOD_STATES);
  strList(e, `${p}.tags`, v.tags, LIMITS.listItems, 64);
  sourceRef(e, `${p}.source`, v.source);
  nutrientMap(e, `${p}.per100g`, v.per100g);
  if (!Array.isArray(v.servings) || v.servings.length > LIMITS.listItems) e.push(`${p}.servings: expected a list.`);
  else
    v.servings.forEach((s, i) => {
      const q = `${p}.servings[${i}]`;
      if (!isObj(s)) return e.push(`${q}: expected a serving.`);
      str(e, `${q}.label`, s.label, LIMITS.name, { min: 1 });
      num(e, `${q}.grams`, s.grams, 0, LIMITS.grams, { gtMin: true });
      str(e, `${q}.evidence`, s.evidence, LIMITS.shortText);
      oneOf(e, `${q}.source`, s.source, SERVING_SOURCES);
    });
  str(e, `${p}.notes`, v.notes, LIMITS.notes, { optional: true });
  str(e, `${p}.barcode`, v.barcode, 32, { optional: true, re: /^[0-9A-Za-z-]{1,32}$/ });
  oneOf(e, `${p}.portionMode`, v.portionMode, ['any', 'servings_only'], true);
  num(e, `${p}.revision`, v.revision, 0, LIMITS.revision, { int: true });
  bool(e, `${p}.archived`, v.archived, true);
  iso(e, `${p}.updatedAt`, v.updatedAt, true);
  return e.list.length === before;
}

export function checkRecipe(e: Errs, p: string, v: unknown): v is Recipe {
  const before = e.list.length;
  if (!isObj(v)) {
    e.push(`${p}: expected a recipe record.`);
    return false;
  }
  str(e, `${p}.id`, v.id, 128, { re: ID_RE });
  str(e, `${p}.name`, v.name, LIMITS.name, { min: 1 });
  strList(e, `${p}.aliases`, v.aliases, LIMITS.listItems, LIMITS.name);
  if (!Array.isArray(v.ingredients) || v.ingredients.length > LIMITS.ingredients) e.push(`${p}.ingredients: expected a list.`);
  else
    v.ingredients.forEach((g, i) => {
      const q = `${p}.ingredients[${i}]`;
      if (!isObj(g)) return e.push(`${q}: expected an ingredient.`);
      str(e, `${q}.foodId`, g.foodId, 128, { re: ID_RE });
      str(e, `${q}.foodName`, g.foodName, LIMITS.name);
      nutrientMap(e, `${q}.per100g`, g.per100g);
      sourceRef(e, `${q}.source`, g.source);
      oneOf(e, `${q}.state`, g.state, FOOD_STATES);
      num(e, `${q}.grams`, g.grams, 0, LIMITS.recipeGrams);
    });
  num(e, `${p}.yieldGrams`, v.yieldGrams, 0, LIMITS.recipeGrams, { nullable: true, gtMin: true });
  num(e, `${p}.servings`, v.servings, 0, 10_000, { nullable: true, gtMin: true });
  str(e, `${p}.method`, v.method, LIMITS.method, { optional: true });
  num(e, `${p}.revision`, v.revision, 0, LIMITS.revision, { int: true });
  bool(e, `${p}.archived`, v.archived, true);
  iso(e, `${p}.updatedAt`, v.updatedAt);
  return e.list.length === before;
}

export function checkEntry(e: Errs, p: string, v: unknown): v is MealEntry {
  const before = e.list.length;
  if (!isObj(v)) {
    e.push(`${p}: expected a diary entry.`);
    return false;
  }
  str(e, `${p}.id`, v.id, 128, { re: ID_RE });
  localDate(e, `${p}.localDate`, v.localDate);
  oneOf(e, `${p}.meal`, v.meal, MEALS);
  iso(e, `${p}.loggedAtUtc`, v.loggedAtUtc);
  num(e, `${p}.tzOffsetMin`, v.tzOffsetMin, -840, 840, { int: true });
  const it = v.item;
  if (!isObj(it)) e.push(`${p}.item: missing.`);
  else {
    oneOf(e, `${p}.item.kind`, it.kind, ['food', 'recipe']);
    str(e, `${p}.item.refId`, it.refId, 128, { re: ID_RE });
    str(e, `${p}.item.name`, it.name, LIMITS.name);
    sourceRef(e, `${p}.item.source`, it.source);
    num(e, `${p}.item.revision`, it.revision, 0, LIMITS.revision, { int: true });
  }
  const po = v.portion;
  if (!isObj(po)) e.push(`${p}.portion: missing.`);
  else {
    num(e, `${p}.portion.quantity`, po.quantity, 0, LIMITS.grams);
    str(e, `${p}.portion.unit`, po.unit, 100, { min: 1 });
    num(e, `${p}.portion.grams`, po.grams, 0, LIMITS.grams);
    if (po.servingsOnly !== undefined && typeof po.servingsOnly !== 'boolean') e.push(`${p}.portion.servingsOnly: expected true/false.`);
    str(e, `${p}.portion.conversionEvidence`, po.conversionEvidence, LIMITS.shortText);
  }
  const nt = v.nutrients;
  if (!isObj(nt) || !isObj(nt.values) || !Array.isArray(nt.incomplete)) e.push(`${p}.nutrients: malformed.`);
  else {
    for (const [k, x] of Object.entries(nt.values)) {
      if (!NUTRIENT_KEY_RE.test(k)) e.push(`${p}.nutrients.values.${k}: unknown nutrient key.`);
      else num(e, `${p}.nutrients.values.${k}`, x, 0, LIMITS.total);
    }
    if (nt.incomplete.length > 100) e.push(`${p}.nutrients.incomplete: too many items.`);
    nt.incomplete.forEach((k, i) => str(e, `${p}.nutrients.incomplete[${i}]`, k, 32, { re: NUTRIENT_KEY_RE }));
  }
  nutrientMap(e, `${p}.per100g`, v.per100g);
  oneOf(e, `${p}.estimate`, v.estimate, ['measured', 'estimated']);
  str(e, `${p}.note`, v.note, LIMITS.note, { optional: true });
  str(e, `${p}.imageId`, v.imageId, 128, { optional: true, re: ID_RE });
  iso(e, `${p}.updatedAt`, v.updatedAt);
  return e.list.length === before;
}

export function checkSettings(e: Errs, p: string, v: unknown): v is Partial<Settings> {
  const before = e.list.length;
  if (!isObj(v)) {
    e.push(`${p}: expected settings.`);
    return false;
  }
  oneOf(e, `${p}.ageBand`, v.ageBand, ['unset', 'under18', 'adult'], true);
  bool(e, `${p}.showCalories`, v.showCalories, true);
  if (v.summaryNutrients !== undefined) {
    if (!Array.isArray(v.summaryNutrients) || v.summaryNutrients.length > 50) e.push(`${p}.summaryNutrients: expected a list.`);
    else v.summaryNutrients.forEach((k, i) => oneOf(e, `${p}.summaryNutrients[${i}]`, k, SUMMARY_CODES));
  }
  bool(e, `${p}.onlineLookup`, v.onlineLookup, true);
  bool(e, `${p}.keepPhotos`, v.keepPhotos, true);
  oneOf(e, `${p}.theme`, v.theme, ['system', 'light', 'dark'], true);
  iso(e, `${p}.lastBackupAt`, v.lastBackupAt, true);
  bool(e, `${p}.onboarded`, v.onboarded, true);
  return e.list.length === before;
}

export function checkFavorites(e: Errs, p: string, v: unknown): v is string[] {
  const before = e.list.length;
  if (!Array.isArray(v) || v.length > LIMITS.favorites) {
    e.push(`${p}: expected a list of food ids.`);
    return false;
  }
  v.forEach((id, i) => str(e, `${p}[${i}]`, id, 128, { re: ID_RE }));
  return e.list.length === before;
}
