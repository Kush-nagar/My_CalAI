// Core domain model. Shared contract for UI, storage, backup and data workers.
// Rules (docs/handoff/09, 11): missing is null with a reason, never zero;
// canonical mass is grams; diary entries carry immutable nutrient snapshots.

export const NUTRIENTS = [
  { code: 'energy_kcal', label: 'Energy', unit: 'kcal' },
  { code: 'protein_g', label: 'Protein', unit: 'g' },
  { code: 'carb_g', label: 'Carbohydrate', unit: 'g' },
  { code: 'fat_g', label: 'Fat', unit: 'g' },
  { code: 'fiber_g', label: 'Fibre', unit: 'g' },
  { code: 'sugars_g', label: 'Sugars', unit: 'g' },
  { code: 'satfat_g', label: 'Saturated fat', unit: 'g' },
  { code: 'sodium_mg', label: 'Sodium', unit: 'mg' },
  { code: 'potassium_mg', label: 'Potassium', unit: 'mg' },
  { code: 'calcium_mg', label: 'Calcium', unit: 'mg' },
  { code: 'iron_mg', label: 'Iron', unit: 'mg' },
  { code: 'zinc_mg', label: 'Zinc', unit: 'mg' },
  { code: 'vitc_mg', label: 'Vitamin C', unit: 'mg' },
  { code: 'folate_ug', label: 'Folate (DFE)', unit: 'µg' },
  { code: 'vitb12_ug', label: 'Vitamin B12', unit: 'µg' },
] as const;

export type NutrientCode = (typeof NUTRIENTS)[number]['code'];
export const NUTRIENT_CODES: NutrientCode[] = NUTRIENTS.map((n) => n.code);

/** How a value was obtained. */
export type ValueKind = 'measured' | 'label' | 'calculated' | 'user' | 'estimated';

export interface NutrientValue {
  /** null = unknown. Never coerce to 0. */
  amount: number | null;
  kind: ValueKind;
  /** Required when amount is null, e.g. "not reported by source". */
  missingReason?: string;
}

/** Per-100 g (edible portion) nutrient map. Absent key == not reported. */
export type NutrientMap = Partial<Record<NutrientCode, NutrientValue>>;

export type SourceKind =
  | 'usda_fdc' // USDA FoodData Central, CC0
  | 'off' // Open Food Facts, ODbL (user-triggered lookup only)
  | 'label' // user typed from a package label
  | 'user' // user-entered custom food
  | 'recipe' // calculated from a user recipe
  | 'template'; // bundled template recipe calculated from listed ingredients

export interface SourceRef {
  kind: SourceKind;
  /** Human label, e.g. "USDA FDC SR Legacy". */
  name: string;
  /** Record id at the source, e.g. FDC id. */
  recordId?: string;
  edition?: string;
  license?: string;
  retrievedAt?: string; // ISO date
  url?: string;
}

export type FoodState = 'raw' | 'cooked' | 'prepared' | 'packaged' | 'dry' | 'unknown';

export interface ServingConversion {
  /** e.g. "1 cup", "1 medium roti" */
  label: string;
  grams: number;
  /** Where this gram weight comes from. No evidence => do not offer it. */
  evidence: string;
  source: 'source_data' | 'user_calibrated' | 'package_label';
}

export interface Food {
  id: string; // stable; seed ids prefixed "fdc:", "tpl:"; custom "c:"; recipe "r:"
  name: string;
  /** Regional names, transliterations, spellings. */
  aliases: string[];
  state: FoodState;
  tags: string[]; // e.g. "pulse", "grain", "south-indian"
  source: SourceRef;
  per100g: NutrientMap;
  servings: ServingConversion[];
  /** Free-text caveats shown with provenance. */
  notes?: string;
  barcode?: string;
  /**
   * 'servings_only' when grams are not meaningful for this item (e.g. a recipe
   * whose cooked yield was not weighed). UI must then hide g/ml units.
   */
  portionMode?: 'any' | 'servings_only';
  /** Monotonic revision; bump on edit (custom foods). */
  revision: number;
  /** For custom foods/recipes: soft-deleted items stay resolvable. */
  archived?: boolean;
  updatedAt?: string;
}

export interface RecipeIngredient {
  foodId: string;
  /** Snapshot of the food at time of adding (name + per100g + source). */
  foodName: string;
  per100g: NutrientMap;
  source: SourceRef;
  state: FoodState;
  grams: number;
}

export interface Recipe {
  id: string; // "r:<uuid>"
  name: string;
  aliases: string[];
  ingredients: RecipeIngredient[];
  /** Weighed final cooked weight in grams; null if not weighed. */
  yieldGrams: number | null;
  /** Number of servings the batch was split into; null if not set. */
  servings: number | null;
  method?: string;
  revision: number;
  archived?: boolean;
  updatedAt: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snacks' },
];

export interface PortionSnapshot {
  quantity: number;
  /** "g", "ml" or a serving label. */
  unit: string;
  grams: number;
  /** Evidence for unit->grams conversion (serving label evidence or "weighed"). */
  conversionEvidence: string;
  /** True when grams are raw-ingredient weight (recipe without weighed yield): hide grams in UI. */
  servingsOnly?: boolean;
}

/** Absolute nutrient totals for the logged portion (not per 100 g). */
export interface NutrientTotals {
  values: Partial<Record<NutrientCode, number>>;
  /** Nutrients with at least one unknown contributor => total is a lower bound. */
  incomplete: NutrientCode[];
}

export type EstimateStatus = 'measured' | 'estimated';

export interface MealEntry {
  id: string;
  /** Local calendar date the user ate, YYYY-MM-DD. */
  localDate: string;
  meal: MealSlot;
  loggedAtUtc: string; // ISO instant
  tzOffsetMin: number; // minutes east of UTC at logging time
  item: {
    kind: 'food' | 'recipe';
    refId: string;
    name: string;
    source: SourceRef;
    revision: number;
  };
  portion: PortionSnapshot;
  /** Immutable snapshot; never recomputed from catalog after save except on explicit edit. */
  nutrients: NutrientTotals;
  /** Per-100g basis captured at log time so edits to quantity can recompute. */
  per100g: NutrientMap;
  estimate: EstimateStatus;
  note?: string;
  imageId?: string;
  updatedAt: string;
}

export interface ImageAsset {
  id: string;
  blob: Blob;
  mime: string;
  createdAt: string;
}

export type AgeBand = 'unset' | 'under18' | 'adult';

/**
 * Daily reference amounts the user chose. null = no goal (the UI then shows amounts only).
 * Energy and macro goals are never offered in under-18 mode.
 */
export interface Goals {
  energy_kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  water_ml: number | null;
}

export const DEFAULT_GOALS: Goals = { energy_kcal: null, protein_g: null, carb_g: null, fat_g: null, water_ml: 2000 };

/** One drink of water, stored in kv "water" as a list. */
export interface WaterLog {
  id: string;
  localDate: string;
  ml: number;
  at: string; // ISO instant
}

export interface Settings {
  ageBand: AgeBand;
  /** Calories hidden everywhere when false. Forced false-able; under18 defaults hidden. */
  showCalories: boolean;
  /** Which nutrients appear on Today summary. */
  summaryNutrients: NutrientCode[];
  /** User-triggered Open Food Facts barcode lookup. Off by default. */
  onlineLookup: boolean;
  /** Keep attached meal photos on device. */
  keepPhotos: boolean;
  /** User opted in to on-device photo food-name suggestions (model downloaded on request). */
  photoSuggestions: boolean;
  goals: Goals;
  theme: 'system' | 'light' | 'dark';
  lastBackupAt?: string;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  ageBand: 'unset',
  showCalories: true,
  summaryNutrients: ['energy_kcal', 'protein_g', 'carb_g', 'fat_g', 'fiber_g'],
  onlineLookup: false,
  keepPhotos: false,
  photoSuggestions: false,
  goals: DEFAULT_GOALS,
  theme: 'system',
  onboarded: false,
};
