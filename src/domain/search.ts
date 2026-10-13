import type { Food } from './types';

/** Lowercase, strip diacritics/punctuation, collapse spaces. */
export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Phonetic-ish skeleton for romanised Indian food names so common spelling
 * variants meet: daal/dal, paneer/panir, chapati/chapathi, bhindi/bindi,
 * poha/pova is NOT merged (different consonant). Conservative on purpose.
 */
export function skeleton(s: string): string {
  return normalize(s)
    .replace(/\s+/g, '')
    .replace(/([a-z])h/g, '$1') // aspirates: bh->b, dh->d, th->t, kh->k, ch->c, sh->s
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/q/g, 'k')
    .replace(/ee|ii|ie|ey/g, 'i')
    .replace(/oo|uu|ou/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/y$/g, 'i')
    .replace(/(.)\1+/g, '$1'); // doubled letters
}

export interface SearchHit<T = Food> {
  item: T;
  score: number;
  matched: string;
}

interface Indexed<T> {
  item: T;
  names: { norm: string; skel: string; raw: string }[];
  /** Added to every match score; lets curated and personal items outrank bulk catalog rows. */
  bias: number;
}

/** Bulk USDA rows (tag "usda-global") rank just below curated/personal records with the same match. */
export const defaultBias = (item: Pick<Food, 'tags'>) => (item.tags.includes('usda-global') ? -4 : 0);

export class SearchIndex<T extends Pick<Food, 'name' | 'aliases' | 'tags'>> {
  private rows: Indexed<T>[] = [];

  constructor(items: T[] = []) {
    this.setItems(items);
  }

  setItems(items: T[]) {
    this.rows = items.map((item) => ({
      item,
      names: [item.name, ...item.aliases].map((raw) => ({ raw, norm: normalize(raw), skel: skeleton(raw) })),
      bias: defaultBias(item),
    }));
  }

  search(query: string, limit = 50): SearchHit<T>[] {
    const q = normalize(query);
    if (!q) return [];
    const qs = skeleton(query);
    const qWords = q.split(' ');
    const hits: SearchHit<T>[] = [];
    for (const row of this.rows) {
      let best = 0;
      let matched = '';
      row.names.forEach((n, i) => {
        const aliasPenalty = i === 0 ? 0 : 2;
        let s = 0;
        if (n.norm === q) s = 100;
        else if (n.norm.startsWith(q)) s = 80;
        else if (qWords.every((w) => n.norm.split(' ').some((nw) => nw.startsWith(w)))) s = 65;
        else if (n.norm.includes(q)) s = 50;
        else if (qs.length >= 3 && n.skel === qs) s = 45;
        else if (qs.length >= 3 && n.skel.startsWith(qs)) s = 35;
        else if (qs.length >= 4 && n.skel.includes(qs)) s = 25;
        if (s > 0) s -= aliasPenalty;
        if (s > best) {
          best = s;
          matched = n.raw;
        }
      });
      if (best === 0 && row.item.tags.some((t) => normalize(t) === q)) {
        best = 15;
        matched = q;
      }
      if (best > 0) hits.push({ item: row.item, score: best + row.bias, matched });
    }
    hits.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length || a.item.name.localeCompare(b.item.name));
    return hits.slice(0, limit);
  }
}
