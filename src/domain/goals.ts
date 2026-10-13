// Daily reference helpers. The user always chooses the numbers; these only offer an estimate.
// Never used in under-18 mode (no energy or macro targets there).

export type Sex = 'female' | 'male';
export const ACTIVITY = [
  { id: 'sedentary', label: 'Mostly sitting', factor: 1.2 },
  { id: 'light', label: 'Lightly active', factor: 1.375 },
  { id: 'moderate', label: 'Moderately active', factor: 1.55 },
  { id: 'very', label: 'Very active', factor: 1.725 },
] as const;
export type Activity = (typeof ACTIVITY)[number]['id'];

/**
 * Estimated energy to maintain current weight: Mifflin-St Jeor resting energy × activity factor.
 * An estimate for adults only, rounded to 10 kcal. Not advice and not a weight-loss plan.
 */
export function estimateMaintenanceKcal(p: { sex: Sex; ageYears: number; heightCm: number; weightKg: number; activity: Activity }): number {
  const { sex, ageYears: a, heightCm: h, weightKg: w } = p;
  if (!(a >= 18 && a <= 110)) throw new RangeError('Age must be 18–110 for this estimate');
  if (!(h >= 120 && h <= 230)) throw new RangeError('Height must be 120–230 cm');
  if (!(w >= 30 && w <= 300)) throw new RangeError('Weight must be 30–300 kg');
  const f = ACTIVITY.find((x) => x.id === p.activity)?.factor;
  if (!f) throw new RangeError('Unknown activity level');
  const bmr = 10 * w + 6.25 * h - 5 * a + (sex === 'male' ? 5 : -161);
  return Math.round((bmr * f) / 10) * 10;
}

/**
 * Split energy into grams using a mid-range share within the US Institute of Medicine Acceptable
 * Macronutrient Distribution Ranges (protein 10–35%, carbohydrate 45–65%, fat 20–35%).
 */
export const DEFAULT_SPLIT = { protein: 0.2, carb: 0.5, fat: 0.3 };
export function macrosFromKcal(kcal: number, split = DEFAULT_SPLIT): { protein_g: number; carb_g: number; fat_g: number } {
  if (!(kcal > 0)) throw new RangeError('Calories must be positive');
  return {
    protein_g: Math.round((kcal * split.protein) / 4),
    carb_g: Math.round((kcal * split.carb) / 4),
    fat_g: Math.round((kcal * split.fat) / 9),
  };
}

/** Progress toward a reference amount. `over` is shown neutrally ("above"), never as failure. */
export function progress(eaten: number, goal: number | null): { fraction: number; left: number | null; over: number | null } {
  if (goal === null || !(goal > 0)) return { fraction: 0, left: null, over: null };
  const e = Math.max(0, eaten);
  return { fraction: Math.min(1, e / goal), left: e <= goal ? goal - e : null, over: e > goal ? e - goal : null };
}
