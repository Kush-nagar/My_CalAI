import { scaleNutrients } from './nutrition';
import type { Food, MealEntry, MealSlot, PortionSnapshot } from './types';

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
