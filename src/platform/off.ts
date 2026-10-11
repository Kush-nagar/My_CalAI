// Open Food Facts (OFF) barcode lookup. The ONLY runtime network call in the app, and only when the
// user presses "Look up on Open Food Facts". Sends just the barcode in the URL path.
//
// Notes on OFF API etiquette (https://openfoodfacts.github.io/openfoodfacts-server/api/):
//  - OFF asks clients to send a descriptive User-Agent ("AppName/Version (contact)"). Browsers forbid
//    scripts from setting User-Agent, so we cannot. OFF's docs describe no required query parameter for
//    web apps, so we add none (adding an app-name param would just be an extra identifier we send).
//  - `fields=` keeps the response small. Read-only product reads need no auth.
//  - Data licence: database ODbL 1.0, contents Database Contents Licence, images CC BY-SA. We store only
//    numeric nutrient facts + name/brand and show attribution before saving.
import type { Food, NutrientCode, NutrientMap, NutrientValue, ServingConversion } from '../domain/types';

export const OFF_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product/';
export const OFF_FIELDS = [
  'code',
  'product_name',
  'brands',
  'quantity',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'nutriments',
  'nutrition_data_per',
  'data_quality_warnings_tags',
  'completeness',
].join(',');
export const OFF_ATTRIBUTION = 'ODbL — © Open Food Facts contributors';
export const OFF_CAVEAT =
  'Community-contributed data; it can be wrong or incomplete and may differ from the package in your hand. Check against the label before relying on it.';

export class OffError extends Error {
  constructor(
    public code: 'network' | 'timeout' | 'bad_response' | 'not_found',
    message: string,
  ) {
    super(message);
  }
}

export interface OffPreview {
  food: Food;
  brand?: string;
  quantity?: string;
  /** Plain-language data-quality notes for the preview screen. */
  warnings: string[];
}

interface OffNutrientSpec {
  code: NutrientCode;
  key: string;
  /** Multiply OFF's grams-per-100g by this to reach the app unit. */
  factor: number;
  core: boolean;
  max: number;
}

const SPECS: OffNutrientSpec[] = [
  { code: 'energy_kcal', key: 'energy-kcal_100g', factor: 1, core: true, max: 900 },
  { code: 'protein_g', key: 'proteins_100g', factor: 1, core: true, max: 100 },
  { code: 'carb_g', key: 'carbohydrates_100g', factor: 1, core: true, max: 100 },
  { code: 'fat_g', key: 'fat_100g', factor: 1, core: true, max: 100 },
  { code: 'fiber_g', key: 'fiber_100g', factor: 1, core: true, max: 100 },
  { code: 'sugars_g', key: 'sugars_100g', factor: 1, core: true, max: 100 },
  { code: 'satfat_g', key: 'saturated-fat_100g', factor: 1, core: true, max: 100 },
  { code: 'sodium_mg', key: 'sodium_100g', factor: 1000, core: true, max: 40000 },
  // Micronutrients: only recorded when OFF reports them (g -> mg).
  { code: 'potassium_mg', key: 'potassium_100g', factor: 1000, core: false, max: 100000 },
  { code: 'calcium_mg', key: 'calcium_100g', factor: 1000, core: false, max: 100000 },
  { code: 'iron_mg', key: 'iron_100g', factor: 1000, core: false, max: 100000 },
  { code: 'zinc_mg', key: 'zinc_100g', factor: 1000, core: false, max: 100000 },
  { code: 'vitc_mg', key: 'vitamin-c_100g', factor: 1000, core: false, max: 100000 },
];

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Map OFF nutriments (per 100 g) to a NutrientMap. Missing => null + reason, never 0. */
export function mapNutriments(n: Record<string, unknown> | undefined): { map: NutrientMap; warnings: string[] } {
  const map: NutrientMap = {};
  const warnings: string[] = [];
  const src = n ?? {};
  for (const s of SPECS) {
    const raw = src[s.key];
    const num = toNumber(raw);
    let v: NutrientValue | undefined;
    if (num === null) {
      if (s.core) {
        v = {
          amount: null,
          kind: 'label',
          missingReason: raw === undefined ? 'not reported by Open Food Facts' : 'invalid value in Open Food Facts',
        };
      }
    } else if (num < 0 || num * s.factor > s.max) {
      v = { amount: null, kind: 'label', missingReason: 'implausible value in Open Food Facts; ignored' };
      warnings.push(`Ignored an implausible ${s.code} value.`);
    } else {
      v = { amount: Math.round(num * s.factor * 1000) / 1000, kind: 'label' };
    }
    if (v) map[s.code] = v;
  }
  return { map, warnings };
}

/** Map an OFF API response body to a Food ready to be saved as a custom food. */
export function mapOffResponse(body: unknown, barcode: string, retrievedAt: string): OffPreview {
  if (!body || typeof body !== 'object') throw new OffError('bad_response', 'Unexpected response from Open Food Facts');
  const b = body as { status?: unknown; product?: unknown };
  const found = b.status === 1 || b.status === 'success';
  if (!found || !b.product || typeof b.product !== 'object') throw new OffError('not_found', 'Not found on Open Food Facts');
  const p = b.product as Record<string, unknown>;
  const code = typeof p.code === 'string' ? p.code : barcode;
  if (code !== barcode) throw new OffError('bad_response', 'Open Food Facts returned a different barcode');

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined);
  const name = str(p.product_name) ?? `Product ${barcode}`;
  const brand = str(p.brands)?.split(',')[0]?.trim();
  const quantity = str(p.quantity);

  const nut = p.nutriments && typeof p.nutriments === 'object' ? (p.nutriments as Record<string, unknown>) : undefined;
  const { map, warnings } = mapNutriments(nut);
  if (!nut || Object.keys(nut).length === 0) warnings.push('This product has no nutrition facts on Open Food Facts.');
  if (p.nutrition_data_per && p.nutrition_data_per !== '100g') {
    warnings.push('Entered per serving on Open Food Facts; per-100 g values are derived by OFF and may be less reliable.');
  }
  const missing = Object.entries(map).filter(([, v]) => v?.amount === null).length;
  if (missing > 0) warnings.push(`${missing} nutrient value(s) are missing and stay unknown (not zero).`);

  const servings: ServingConversion[] = [];
  const sq = toNumber(p.serving_quantity);
  if (sq !== null && sq > 0 && p.serving_quantity_unit === 'g') {
    const label = str(p.serving_size) ?? `${sq} g serving`;
    servings.push({ label: `1 serving (${label})`, grams: sq, evidence: `Package label serving size: ${label}`, source: 'package_label' });
  }

  const food: Food = {
    id: `c:off-${barcode}`,
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    aliases: [],
    state: 'packaged',
    tags: ['packaged', 'open-food-facts'],
    source: {
      kind: 'off',
      name: 'Open Food Facts',
      recordId: barcode,
      license: 'ODbL 1.0 (database); Database Contents Licence (contents)',
      retrievedAt: retrievedAt.slice(0, 10),
      url: `https://world.openfoodfacts.org/product/${barcode}`,
    },
    per100g: map,
    servings,
    notes: `${OFF_ATTRIBUTION}. ${OFF_CAVEAT}`,
    barcode,
    portionMode: 'any',
    revision: 1,
  };
  return { food, brand, quantity, warnings };
}

export interface OffFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

/** Look up one barcode. Caller must only invoke this after an explicit user action. */
export async function lookupOff(barcode: string, opts: OffFetchOptions = {}): Promise<OffPreview> {
  if (!/^\d{8,14}$/.test(barcode)) throw new OffError('bad_response', 'Invalid barcode');
  const f = opts.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
  let res: Response;
  try {
    res = await f(`${OFF_ENDPOINT}${barcode}.json?fields=${OFF_FIELDS}`, {
      signal: ctl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new OffError('timeout', 'Open Food Facts took too long to answer');
    throw new OffError('network', 'Could not reach Open Food Facts (are you offline?)');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) throw new OffError('not_found', 'Not found on Open Food Facts');
  if (!res.ok) throw new OffError('bad_response', `Open Food Facts returned HTTP ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new OffError('bad_response', 'Open Food Facts returned unreadable data');
  }
  return mapOffResponse(body, barcode, (opts.now?.() ?? new Date()).toISOString());
}
