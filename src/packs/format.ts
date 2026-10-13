// Offline food packs: parsing, compact in-memory index, search and barcode lookup.
// Pure module (used by the packs worker and unit tests). Format: scripts/packs/lib.mjs.
import { normalize } from '../domain/search';
import { NUTRIENT_CODES, type Food, type NutrientCode, type NutrientMap, type ServingConversion } from '../domain/types';

export interface PackInfo {
  id: string;
  name: string;
  description: string;
  source: string;
  license: string;
  attribution: string;
  url: string;
  version: string;
  rows: number;
  files: { path: string; bytes: number; sha256: string }[];
}

/** Column order in shard files (header line is checked). */
export const COLUMNS = ['gtin', 'name', 'brand', 'kcal', 'protein', 'carb', 'fat', 'fiber', 'sugars', 'satfat', 'sodium_mg', 'basis', 'serving_qty', 'serving_label', 'ref'] as const;
const NUM_COLS: { col: number; code: NutrientCode }[] = [
  { col: 3, code: 'energy_kcal' }, { col: 4, code: 'protein_g' }, { col: 5, code: 'carb_g' }, { col: 6, code: 'fat_g' },
  { col: 7, code: 'fiber_g' }, { col: 8, code: 'sugars_g' }, { col: 9, code: 'satfat_g' }, { col: 10, code: 'sodium_mg' },
];
const NN = NUM_COLS.length;

export interface PackRow {
  pack: string;
  gtin: string;
  name: string;
  brand: string;
  values: (number | null)[]; // NUM_COLS order
  basis: 'g' | 'ml';
  servingQty: number | null;
  servingLabel: string;
  ref: string;
}

/** Compact columnar store for hundreds of thousands of products. */
export class PackIndex {
  private names: string[] = [];
  private brands: string[] = [];
  private gtins: string[] = [];
  private refs: string[] = [];
  private servLabels: string[] = [];
  private packOf: string[] = [];
  private nums: Float32Array = new Float32Array(0);
  private serv: Float32Array = new Float32Array(0);
  private basis: Uint8Array = new Uint8Array(0);
  private hay = '';
  private starts: Uint32Array = new Uint32Array(0);
  private byGtin = new Map<string, number>();
  private pending: { pack: string; lines: string[] }[] = [];

  get size() {
    return this.names.length;
  }

  /** Add one shard's text. Call build() after the last shard. Malformed lines are skipped. */
  addShard(pack: string, text: string): number {
    const lines = text.split('\n');
    const header = lines.shift()?.split('\t') ?? [];
    if (COLUMNS.some((c, i) => header[i] !== c)) throw new Error('Pack file has an unexpected format');
    const ok = lines.filter((l) => l.length > 0);
    this.pending.push({ pack, lines: ok });
    return ok.length;
  }

  build() {
    const total = this.names.length + this.pending.reduce((s, p) => s + p.lines.length, 0);
    const nums = new Float32Array(total * NN);
    nums.set(this.nums);
    const serv = new Float32Array(total);
    serv.set(this.serv);
    const basis = new Uint8Array(total);
    basis.set(this.basis);
    const hayParts: string[] = this.hay ? [this.hay] : [];
    for (const { pack, lines } of this.pending) {
      for (const line of lines) {
        const c = line.split('\t');
        if (c.length < COLUMNS.length || !c[1]) continue;
        const i = this.names.length;
        this.names.push(c[1]);
        this.brands.push(c[2]);
        this.gtins.push(c[0]);
        this.refs.push(c[14]);
        this.servLabels.push(c[13]);
        this.packOf.push(pack);
        for (let k = 0; k < NN; k++) {
          const v = c[NUM_COLS[k].col];
          nums[i * NN + k] = v === '' ? NaN : Number(v);
        }
        serv[i] = c[12] === '' ? NaN : Number(c[12]);
        basis[i] = c[11] === 'ml' ? 1 : 0;
        if (c[0]) {
          const g = normGtin(c[0]);
          if (g && !this.byGtin.has(g)) this.byGtin.set(g, i);
        }
        hayParts.push(normalize(`${c[1]} ${c[2]}`));
      }
    }
    this.pending = [];
    const n = this.names.length;
    this.nums = nums.subarray(0, n * NN);
    this.serv = serv.subarray(0, n);
    this.basis = basis.subarray(0, n);
    this.hay = hayParts.join('\n');
    // Line start offsets for mapping a match position back to a row.
    const starts = new Uint32Array(n);
    let pos = 0;
    for (let i = 0; i < n; i++) {
      starts[i] = pos;
      pos = this.hay.indexOf('\n', pos) + 1;
      if (pos === 0) pos = this.hay.length;
    }
    this.starts = starts;
  }

  row(i: number): PackRow {
    const values: (number | null)[] = [];
    for (let k = 0; k < NN; k++) {
      const v = this.nums[i * NN + k];
      // Stored as float32; source data has ≤4 significant digits, so this restores the exact value.
      values.push(Number.isNaN(v) ? null : Number(v.toPrecision(5)));
    }
    const s = this.serv[i];
    const sq = Number.isNaN(s) || !(s > 0) ? null : Number(s.toPrecision(5));
    return {
      pack: this.packOf[i],
      gtin: this.gtins[i],
      name: this.names[i],
      brand: this.brands[i],
      values,
      basis: this.basis[i] ? 'ml' : 'g',
      servingQty: sq,
      servingLabel: this.servLabels[i],
      ref: this.refs[i],
    };
  }

  private rowAt(pos: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  private line(i: number): string {
    const end = i + 1 < this.starts.length ? this.starts[i + 1] - 1 : this.hay.length;
    return this.hay.slice(this.starts[i], end);
  }

  /** Every query word must appear; ranking prefers whole-word and leading matches, then shorter names. */
  search(query: string, limit = 30): PackRow[] {
    const words = normalize(query).split(' ').filter((w) => w.length > 0);
    if (!words.length || !this.hay) return [];
    const anchor = words.reduce((a, b) => (b.length > a.length ? b : a));
    const seen = new Set<number>();
    const scored: { i: number; s: number }[] = [];
    let pos = this.hay.indexOf(anchor);
    while (pos !== -1 && scored.length < 4000) {
      const i = this.rowAt(pos);
      if (!seen.has(i)) {
        seen.add(i);
        const ln = this.line(i);
        if (words.every((w) => ln.includes(w))) {
          const toks = ln.split(' ');
          let s = 0;
          for (const w of words) s += toks.includes(w) ? 3 : toks.some((t) => t.startsWith(w)) ? 2 : 1;
          if (ln.startsWith(words.join(' '))) s += 3;
          s -= Math.min(3, ln.length / 40);
          scored.push({ i, s });
        }
      }
      pos = this.hay.indexOf(anchor, this.starts[i] + (this.line(i).length || 1));
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, limit).map((x) => this.row(x.i));
  }

  /** Barcode lookup tolerant of UPC/EAN leading-zero differences. */
  byBarcode(code: string): PackRow | null {
    const g = normGtin(code);
    if (!g) return null;
    const i = this.byGtin.get(g);
    return i === undefined ? null : this.row(i);
  }
}

/** Digits only, without leading zeros, so UPC-A, EAN-13 and GTIN-14 forms meet. */
export function normGtin(code: string): string {
  return code.replace(/\D/g, '').replace(/^0+/, '');
}

const PACK_SOURCE: Record<string, { kind: 'usda_fdc' | 'off'; name: string; license: string }> = {
  'usda-branded': { kind: 'usda_fdc', name: 'USDA FoodData Central — Branded Foods (manufacturer label)', license: 'CC0 1.0 (public domain); citation requested' },
  'off-india': { kind: 'off', name: 'Open Food Facts (community-contributed label data)', license: 'ODbL 1.0 — © Open Food Facts contributors' },
  'off-world': { kind: 'off', name: 'Open Food Facts (community-contributed label data)', license: 'ODbL 1.0 — © Open Food Facts contributors' },
};

const titleCase = (s: string) =>
  /[a-z]/.test(s) ? s : s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** Turn a pack product into a loggable Food. Per-100 g or per-100 ml label values; blanks stay unknown. */
export function rowToFood(r: PackRow): Food {
  const src = PACK_SOURCE[r.pack] ?? { kind: 'label' as const, name: r.pack, license: '' };
  const per100g: NutrientMap = {};
  for (const code of NUTRIENT_CODES) per100g[code] = { amount: null, kind: 'label', missingReason: 'Not on the label data' };
  NUM_COLS.forEach(({ code }, k) => {
    const v = r.values[k];
    if (v !== null) per100g[code] = { amount: v, kind: 'label' };
  });
  const servings: ServingConversion[] = [];
  const unit = r.basis;
  if (unit === 'ml') servings.push({ label: '100 ml', grams: 100, evidence: 'Label values are per 100 ml', source: 'package_label' });
  if (r.servingQty) {
    const lbl = r.servingLabel && !/^\d+(\.\d+)?\s*(g|ml)?$/i.test(r.servingLabel) ? `1 serving (${r.servingLabel}, ${r.servingQty} ${unit})` : `1 serving (${r.servingQty} ${unit})`;
    servings.push({ label: lbl.slice(0, 80), grams: r.servingQty, evidence: `Serving size on the package label: ${r.servingQty} ${unit}`, source: 'package_label' });
  }
  const name = titleCase(r.name);
  const brand = r.brand ? titleCase(r.brand) : '';
  return {
    id: `pack:${r.pack}:${r.ref}`,
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} — ${brand}` : name,
    aliases: [],
    state: 'packaged',
    tags: ['branded', r.pack],
    source: {
      kind: src.kind,
      name: src.name,
      recordId: r.ref,
      license: src.license,
      url: r.pack === 'usda-branded' ? `https://fdc.nal.usda.gov/food-details/${r.ref.replace(/^fdc:/, '')}/nutrients` : `https://world.openfoodfacts.org/product/${r.gtin}`,
    },
    per100g,
    servings,
    notes: unit === 'ml' ? 'Label values are per 100 ml; log by serving or 100 ml.' : 'Values from the product label.',
    barcode: r.gtin || undefined,
    portionMode: unit === 'ml' ? 'servings_only' : 'any',
    revision: 1,
  };
}
