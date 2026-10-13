import { scaleNutrients } from './nutrition';
import { NUTRIENT_CODES, type Food, type MealEntry, type MealSlot, type NutrientMap, type PortionSnapshot } from './types';

export interface UnitOption {
  unit: string;
  gramsPerUnit: number;
  evidence: string;
}

/** Units we can honestly offer. Grams always (unless servings_only); servings only with evidence. */
export function unitOptions(food: Food): UnitOption[] {
  const opts: UnitOption[] = [];
  if (food.portionMode !== 'servings_only') {
    opts.push({ unit: 'g', gramsPerUnit: 1, evidence: 'Weight in grams' });
  }
  for (const s of food.servings) {
    if (s.grams > 0 && s.evidence.trim()) opts.push({ unit: s.label, gramsPerUnit: s.grams, evidence: s.evidence });
  }
  return opts;
}

export function makePortion(food: Food, quantity: number, unit: string): PortionSnapshot {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new RangeError('Enter an amount greater than 0');
  const opt = unitOptions(food).find((o) => o.unit === unit);
  if (!opt) throw new Error(`No evidence-backed conversion for "${unit}"`);
  const p: PortionSnapshot = { quantity, unit, grams: quantity * opt.gramsPerUnit, conversionEvidence: opt.evidence };
  if (food.portionMode === 'servings_only') p.servingsOnly = true;
  return p;
}

/** YYYY-MM-DD in the device's local timezone. */
export function localDateOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return localDateOf(new Date(y, m - 1, d + days));
}

export function newId(prefix = ''): string {
  return prefix + crypto.randomUUID();
}

/** Build an immutable diary entry snapshot from a food and portion. */
export function buildEntry(args: {
  food: Food;
  portion: PortionSnapshot;
  meal: MealSlot;
  localDate: string;
  now?: Date;
  estimate?: MealEntry['estimate'];
  note?: string;
  imageId?: string;
}): MealEntry {
  const now = args.now ?? new Date();
  const { food } = args;
  return {
    id: newId('e:'),
    localDate: args.localDate,
    meal: args.meal,
    loggedAtUtc: now.toISOString(),
    tzOffsetMin: -now.getTimezoneOffset(),
    item: {
      kind: food.source.kind === 'recipe' ? 'recipe' : 'food',
      refId: food.id,
      name: food.name,
      source: { ...food.source },
      revision: food.revision,
    },
    portion: args.portion,
    nutrients: scaleNutrients(food.per100g, args.portion.grams),
    per100g: structuredClone(food.per100g),
    estimate: args.estimate ?? 'measured',
    note: args.note,
    imageId: args.imageId,
    updatedAt: now.toISOString(),
  };
}

/** Explicit user edit of portion: recompute from the entry's own captured basis, not the catalog. */
export function editEntryPortion(entry: MealEntry, portion: PortionSnapshot, now = new Date()): MealEntry {
  return {
    ...entry,
    portion,
    nutrients: scaleNutrients(entry.per100g, portion.grams),
    updatedAt: now.toISOString(),
  };
}

/**
 * Quick add: log calories/macros directly (restaurant meal, label in hand, anything not in the
 * catalog). Blank values stay unknown. Stored as one "entry" unit with no weight; the snapshot
 * is per-entry, so editing the quantity scales it.
 */
export function buildQuickEntry(args: {
  name: string;
  values: Partial<Record<'energy_kcal' | 'protein_g' | 'carb_g' | 'fat_g', number | null>>;
  meal: MealSlot;
  localDate: string;
  now?: Date;
}): MealEntry {
  const name = args.name.trim() || 'Quick add';
  if (name.length > 200) throw new Error('Name is too long');
  const per100g: NutrientMap = {};
  let any = false;
  for (const code of NUTRIENT_CODES) {
    const v = (args.values as Record<string, number | null | undefined>)[code];
    if (typeof v === 'number') {
      if (!(v >= 0 && v < 100000)) throw new RangeError('Values must be between 0 and 100000');
      per100g[code] = { amount: v, kind: 'user' };
      any = true;
    } else per100g[code] = { amount: null, kind: 'user', missingReason: 'Not entered' };
  }
  if (!any) throw new Error('Enter at least one value');
  const food: Food = {
    id: newId('quick:'),
    name,
    aliases: [],
    state: 'unknown',
    tags: ['quick-add'],
    source: { kind: 'user', name: 'Quick add (entered by you)' },
    per100g,
    servings: [{ label: '1 entry', grams: 100, evidence: 'Quick add: values entered for the whole entry', source: 'user_calibrated' }],
    portionMode: 'servings_only',
    revision: 1,
  };
  return buildEntry({ food, portion: makePortion(food, 1, '1 entry'), meal: args.meal, localDate: args.localDate, now: args.now });
}
