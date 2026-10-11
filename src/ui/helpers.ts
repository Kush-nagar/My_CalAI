// Pure UI helpers (unit-tested in helpers.test.ts). No DOM access here.
import { formatAmount, sumTotals } from '../domain/nutrition';
import { shiftDate } from '../domain/portion';
import {
  NUTRIENTS,
  type Food,
  type FoodState,
  type MealEntry,
  type MealSlot,
  type NutrientCode,
  type NutrientTotals,
  type PortionSnapshot,
  type ServingConversion,
  type SourceRef,
} from '../domain/types';

/** Meal slot suggested from time of day. */
export function defaultMeal(d: Date = new Date()): MealSlot {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 4 * 60) return 'snack';
  if (m < 11 * 60) return 'breakfast';
  if (m < 15 * 60 + 30) return 'lunch';
  if (m < 18 * 60 + 30) return 'snack';
  return 'dinner';
}

/** Parse a user-typed decimal ("1.5", "1,5", ".5"). Returns null if not a plain non-negative number. */
export function parseDecimal(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Quantity for display: at most 2 decimals, no trailing zeros. */
export function formatQty(n: number): string {
  return Number(n.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatGrams(g: number): string {
  const v = g >= 10 ? Math.round(g) : Math.round(g * 10) / 10;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} g`;
}

/** "150 g", "2 × 1 cup cooked (316 g)", or without grams when grams are not meaningful. */
export function portionLabel(p: PortionSnapshot, opts: { hideGrams?: boolean } = {}): string {
  if (p.unit === 'g') return formatGrams(p.quantity);
  const base = p.quantity === 1 ? p.unit : `${formatQty(p.quantity)} × ${p.unit}`;
  return opts.hideGrams ? base : `${base} (${formatGrams(p.grams)})`;
}

const SOURCE_LABELS: Record<SourceRef['kind'], string> = {
  usda_fdc: 'USDA table',
  off: 'Open Food Facts',
  label: 'Package label',
  user: 'Entered by you',
  recipe: 'Your recipe',
  template: 'Calculated template',
};
export const sourceChipLabel = (s: SourceRef): string => SOURCE_LABELS[s.kind] ?? s.name;

const STATE_LABELS: Record<FoodState, string> = {
  raw: 'Raw',
  cooked: 'Cooked',
  prepared: 'Prepared',
  packaged: 'Packaged',
  dry: 'Dry',
  unknown: '',
};
export const stateLabel = (s: FoodState): string => STATE_LABELS[s];

export const mealLabel = (id: MealSlot): string =>
  ({ breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' })[id];

export function nutrientMeta(code: NutrientCode) {
  return NUTRIENTS.find((n) => n.code === code)!;
}

/** "12.5 g" / "240 kcal" */
export function formatNutrient(code: NutrientCode, value: number): string {
  const m = nutrientMeta(code);
  return `${formatAmount(value, m.unit)} ${m.unit}`;
}

/** Relative day word or short date. `todayDate` injectable for tests. */
export function dayHeading(localDate: string, todayDate: string): { main: string; sub: string } {
  const [y, m, d] = localDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const sub = dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  if (localDate === todayDate) return { main: 'Today', sub };
  if (localDate === shiftDate(todayDate, -1)) return { main: 'Yesterday', sub };
  if (localDate === shiftDate(todayDate, 1)) return { main: 'Tomorrow', sub };
  return { main: dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), sub };
}

/**
 * Rebuild a loggable Food from a diary entry (its own per-100 g snapshot), optionally
 * borrowing evidence-backed servings from the current catalog food.
 */
export function foodFromEntry(entry: MealEntry, catalog?: Food): Food {
  const servings: ServingConversion[] = catalog ? [...catalog.servings] : [];
  const u = entry.portion.unit;
  if (u !== 'g' && !servings.some((s) => s.label === u) && entry.portion.quantity > 0) {
    servings.push({
      label: u,
      grams: entry.portion.grams / entry.portion.quantity,
      evidence: entry.portion.conversionEvidence,
      source: 'user_calibrated',
    });
  }
  return {
    id: entry.item.refId,
    name: entry.item.name,
    aliases: catalog?.aliases ?? [],
    state: catalog?.state ?? 'unknown',
    tags: catalog?.tags ?? [],
    source: entry.item.source,
    per100g: entry.per100g,
    servings,
    portionMode: catalog?.portionMode,
    revision: entry.item.revision,
  };
}

export function groupByMeal(entries: MealEntry[]): Record<MealSlot, MealEntry[]> {
  const out: Record<MealSlot, MealEntry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const e of entries) out[e.meal].push(e);
  return out;
}

export interface DayPoint {
  date: string;
  /** null = nothing logged, or nutrient unknown for all logged foods */
  value: number | null;
  incomplete: boolean;
  entries: number;
  foods: number;
}

export function dateRange(endDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => shiftDate(endDate, i - (days - 1)));
}

export function dailySeries(entries: MealEntry[], dates: string[], code: NutrientCode): DayPoint[] {
  const byDate = new Map<string, MealEntry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.localDate) ?? [];
    arr.push(e);
    byDate.set(e.localDate, arr);
  }
  return dates.map((date) => {
    const es = byDate.get(date) ?? [];
    if (!es.length) return { date, value: null, incomplete: false, entries: 0, foods: 0 };
    const t: NutrientTotals = sumTotals(es.map((e) => e.nutrients));
    return {
      date,
      value: t.values[code] ?? null,
      incomplete: t.incomplete.includes(code),
      entries: es.length,
      foods: new Set(es.map((e) => e.item.refId)).size,
    };
  });
}

export interface TrendStats {
  daysLogged: number;
  distinctFoods: number;
  /** Mean over logged days having a value; null if none. */
  average: number | null;
  averageIncomplete: boolean;
}

export function trendStats(entries: MealEntry[], series: DayPoint[]): TrendStats {
  const known = series.filter((p) => p.value !== null);
  return {
    daysLogged: series.filter((p) => p.entries > 0).length,
    distinctFoods: new Set(entries.map((e) => e.item.refId)).size,
    average: known.length ? known.reduce((s, p) => s + (p.value as number), 0) / known.length : null,
    averageIncomplete: series.some((p) => p.incomplete) || known.length < series.filter((p) => p.entries > 0).length,
  };
}

export function allTags(foods: Food[]): string[] {
  const counts = new Map<string, number>();
  for (const f of foods) for (const t of f.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

export function splitAliases(s: string): string[] {
  return [...new Set(s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))];
}
