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

/**
 * Memory-lean store for hundreds of thousands of products (an iPhone constraint). Each shard is kept
 * as its raw text plus a same-length folded copy for matching (lowercase, accents removed), with
 * line offsets. Fields are parsed only for rows that are returned. Barcodes live in sorted typed arrays.
 */
interface Shard {
  pack: string;
  raw: string;
  low: string;
  starts: Uint32Array; // offset of each data line
  base: number; // global row index of the first line
}

/** Length-preserving fold: lowercase + strip common Latin accents, so offsets stay valid. */
function fold(raw: string): string {
  let low = raw.toLowerCase();
  if (low.length !== raw.length) {
    // Rare characters change length when lowercased: fold them one by one instead.
    low = Array.from(raw, (c) => (c.toLowerCase().length === c.length ? c.toLowerCase() : c)).join('');
  }
  return low.replace(/[\u00C0-\u024F]/g, (c) => {
    const base = c.normalize('NFKD').replace(/\p{M}/gu, '');
    return base.length === 1 ? base : c;
  });
}

export class PackIndex {
  private shards: Shard[] = [];
  private total = 0;
  private gtinKeys = new Float64Array(0);
  private gtinRows = new Uint32Array(0);
  private pendingGtins: [number, number][] = [];

  get size() {
    return this.total;
  }

  /** Add one shard's text. Call build() after the last shard. Malformed lines are skipped at read time. */
  addShard(pack: string, text: string): number {
    const nl = text.indexOf('\n');
    const header = (nl === -1 ? text : text.slice(0, nl)).split('\t');
    if (COLUMNS.some((c, i) => header[i] !== c)) throw new Error('Pack file has an unexpected format');
    const starts: number[] = [];
    let pos = nl + 1;
    while (pos > 0 && pos < text.length) {
      const end = text.indexOf('\n', pos);
      const e = end === -1 ? text.length : end;
      if (e > pos) {
        // A valid row has every column; cheap check: at least 14 tabs before the line end.
        let tabs = 0;
        for (let k = text.indexOf('\t', pos); k !== -1 && k < e; k = text.indexOf('\t', k + 1)) tabs++;
        if (tabs >= COLUMNS.length - 1 && text.charCodeAt(text.indexOf('\t', pos) + 1) !== 9) {
          starts.push(pos);
          const gt = text.slice(pos, text.indexOf('\t', pos));
          const g = normGtin(gt);
          if (g && g.length <= 15) this.pendingGtins.push([Number(g), this.total + starts.length - 1]);
        }
      }
      pos = end === -1 ? -1 : end + 1;
    }
    this.shards.push({ pack, raw: text, low: fold(text), starts: Uint32Array.from(starts), base: this.total });
    this.total += starts.length;
    return starts.length;
  }

  build() {
    const all: [number, number][] = [];
    for (let i = 0; i < this.gtinKeys.length; i++) all.push([this.gtinKeys[i], this.gtinRows[i]]);
    for (const x of this.pendingGtins) all.push(x);
    this.pendingGtins = [];
    // First occurrence wins for duplicate barcodes across packs.
    all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const keys: number[] = [];
    const rows: number[] = [];
    for (const [k, r] of all) if (keys[keys.length - 1] !== k) { keys.push(k); rows.push(r); }
    this.gtinKeys = Float64Array.from(keys);
    this.gtinRows = Uint32Array.from(rows);
  }

  private locate(i: number): { sh: Shard; li: number } {
    let lo = 0;
    let hi = this.shards.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.shards[mid].base <= i) lo = mid;
      else hi = mid - 1;
    }
    const sh = this.shards[lo];
    return { sh, li: i - sh.base };
  }

  private bounds(sh: Shard, li: number): [number, number] {
    const s0 = sh.starts[li];
    const e = sh.raw.indexOf('\n', s0);
    return [s0, e === -1 ? sh.raw.length : e];
  }

  row(i: number): PackRow {
    const { sh, li } = this.locate(i);
    const [s0, e] = this.bounds(sh, li);
    const c = sh.raw.slice(s0, e).split('\t');
    const n = (v: string) => (v === '' || v === undefined ? null : Number(v));
    const values = NUM_COLS.map(({ col }) => {
      const v = n(c[col]);
      return v === null || !Number.isFinite(v) ? null : v;
    });
    const sq = n(c[12]);
    return {
      pack: sh.pack,
      gtin: c[0],
      name: c[1],
      brand: c[2],
      values,
      basis: c[11] === 'ml' ? 'ml' : 'g',
      servingQty: sq !== null && sq > 0 ? sq : null,
      servingLabel: c[13] ?? '',
      ref: c[14] ?? '',
    };
  }

  /** Every query word must appear in name or brand; ranking prefers whole-word and leading matches, then shorter names. */
  search(query: string, limit = 30): PackRow[] {
    const words = normalize(query).split(' ').filter((w) => w.length > 0);
    if (!words.length) return [];
    const anchor = words.reduce((a, b) => (b.length > a.length ? b : a));
    const scored: { i: number; s: number }[] = [];
    for (const sh of this.shards) {
      let pos = sh.low.indexOf(anchor);
      while (pos !== -1 && scored.length < 4000) {
        // Line containing pos.
        let lo = 0;
        let hi = sh.starts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (sh.starts[mid] <= pos) lo = mid;
          else hi = mid - 1;
        }
        const [s0, e] = this.bounds(sh, lo);
        const t1 = sh.low.indexOf('\t', s0);
        const t2 = sh.low.indexOf('\t', t1 + 1);
        const t3 = sh.low.indexOf('\t', t2 + 1);
        if (pos > t1 && pos < t3) {
          const text = sh.low.slice(t1 + 1, t3).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
          if (words.every((w) => text.includes(w))) {
            const toks = text.split(' ');
            let sc = 0;
            for (const w of words) sc += toks.includes(w) ? 3 : toks.some((t) => t.startsWith(w)) ? 2 : 1;
            if (text.startsWith(words.join(' '))) sc += 3;
            sc -= Math.min(3, (t2 - t1) / 40);
            scored.push({ i: sh.base + lo, s: sc });
          }
        }
        pos = sh.low.indexOf(anchor, e);
      }
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, limit).map((x) => this.row(x.i));
  }

  /** Barcode lookup tolerant of UPC/EAN leading-zero differences. */
  byBarcode(code: string): PackRow | null {
    const g = normGtin(code);
    if (!g || g.length > 15) return null;
    const k = Number(g);
    let lo = 0;
    let hi = this.gtinKeys.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = this.gtinKeys[mid];
      if (v === k) return this.row(this.gtinRows[mid]);
      if (v < k) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
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
