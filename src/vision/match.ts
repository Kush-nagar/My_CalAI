// Turn ranked labels into things the user can pick: existing catalog foods, the user's own foods
// and recipes with a matching name, or a search query. Unknown or malformed targets are dropped.
import type { Food } from '../domain/types';
import type { SearchIndex } from '../domain/search';
import type { Ranked } from './scoring';

export interface Candidate {
  label: string;
  /** Catalog records this label maps to (in label order). */
  foods: Food[];
  /** The user's own foods/recipes whose names match the label. */
  own: Food[];
  /** Search query to offer when nothing in the catalog fits. */
  search: string | null;
}

const OWN_KINDS = new Set(['user', 'label', 'recipe', 'off']);

export function toCandidates(ranked: Ranked[], foodsById: Map<string, Food>, index: SearchIndex<Food>, max = 5): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const r of ranked) {
    if (!r || typeof r.label !== 'string' || !r.label.trim() || !Array.isArray(r.targets)) continue;
    if (seen.has(r.label)) continue;
    seen.add(r.label);
    const foods: Food[] = [];
    let search: string | null = null;
    for (const t of r.targets) {
      if (typeof t !== 'string') continue;
      if (t.startsWith('search:')) search ??= t.slice(7).trim() || null;
      else {
        const f = foodsById.get(t);
        if (f && !f.archived && !foods.includes(f)) foods.push(f);
      }
    }
    const own = index
      .search(r.label, 10)
      .map((h) => h.item)
      .filter((f) => OWN_KINDS.has(f.source.kind) && !f.archived && !foods.includes(f))
      .slice(0, 2);
    if (!foods.length && !own.length) search ??= r.label;
    out.push({ label: r.label, foods, own, search });
    if (out.length >= max) break;
  }
  return out;
}
