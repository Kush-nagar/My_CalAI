import { describe, expect, it } from 'vitest';
import { makeScorer, mergeRankings, isUnsure, type LabelEmbeddings, type Ranked } from './scoring';
import { toCandidates } from './match';
import { toPixelValues, referenceImageRGBA } from './preprocess';
import { SearchIndex } from '../domain/search';
import type { Food } from '../domain/types';
import labelEmbeddings from './label-embeddings.json';
import assets from './assets.json';
import { readFileSync } from 'node:fs';

const emb = (rows: number[][]): LabelEmbeddings => {
  const dim = rows[0].length;
  const scales = rows.map((r) => Math.max(...r.map(Math.abs)) / 127);
  const q = new Int8Array(rows.length * dim);
  rows.forEach((r, i) => r.forEach((x, j) => (q[i * dim + j] = Math.round(x / scales[i]))));
  return { model: 't', dim, labels: rows.map((_, i) => ({ label: `l${i}`, targets: [`t${i}`] })), scales, int8: Buffer.from(q.buffer).toString('base64') };
};

describe('scoring', () => {
  const s = makeScorer(emb([[1, 0, 0], [0, 1, 0], [0.7, 0.7, 0]]), Math.log(10), -5);
  it('ranks by cosine and is deterministic', () => {
    const r = s.rank([0.9, 0.1, 0], 3);
    expect(r.map((x) => x.label)).toEqual(['l0', 'l2', 'l1']);
    expect(s.rank([0.9, 0.1, 0], 3)).toEqual(r);
  });
  it('rejects malformed embeddings instead of producing suggestions', () => {
    expect(() => s.rank([1, 0])).toThrow();
    expect(() => s.rank([NaN, 0, 0])).toThrow();
    expect(() => s.rank([0, 0, 0])).toThrow();
    expect(() => makeScorer({ ...emb([[1, 0]]), int8: 'AAAA' }, 1, 0)).toThrow();
  });
  it('merges crops by best match and abstains when every score is low', () => {
    const a: Ranked[] = [{ label: 'x', targets: [], cos: 0.1, score: 0.0001 }];
    const b: Ranked[] = [{ label: 'x', targets: [], cos: 0.3, score: 0.5 }, { label: 'y', targets: [], cos: 0.2, score: 0.1 }];
    expect(mergeRankings([a, b]).map((r) => [r.label, r.cos])).toEqual([['x', 0.3], ['y', 0.2]]);
    expect(isUnsure(a)).toBe(true);
    expect(isUnsure(b)).toBe(false);
    expect(isUnsure([])).toBe(true);
  });
  it('shipped label embeddings are well-formed and every catalog target exists', () => {
    const real = makeScorer(labelEmbeddings, assets.logitScale, assets.logitBias);
    const v = new Array(labelEmbeddings.dim).fill(0).map((_, i) => Math.sin(i));
    expect(real.rank(v, 5)).toHaveLength(5);
    const seed = JSON.parse(readFileSync('src/data/seed/foods.json', 'utf8')).foods as Food[];
    const global = JSON.parse(readFileSync('src/data/seed/global.json', 'utf8')).foods as [number][];
    const ids = new Set([...seed.map((f) => f.id), ...global.map((g) => `fdc:${g[0]}`)]);
    const labels = JSON.parse(readFileSync('scripts/vision/labels.json', 'utf8')) as { targets: string[] }[];
    for (const l of [...labelEmbeddings.labels, ...labels]) for (const t of l.targets) if (!t.startsWith('search:')) expect(ids.has(t), t).toBe(true);
  });
});

describe('preprocess', () => {
  it('maps pixels to [-1, 1] in CHW order', () => {
    const px = referenceImageRGBA(224);
    const out = toPixelValues(px, 224, 224, assets.preprocess);
    expect(out.length).toBe(3 * 224 * 224);
    expect(out[0]).toBeCloseTo(-1); // R at x=0
    expect(out[223]).toBeCloseTo(1); // R at x=223
    expect(out[224 * 224 + 224 * 223]).toBeCloseTo(1); // G at y=223
    expect(() => toPixelValues(px, 100, 100, assets.preprocess)).toThrow();
  });
});

describe('matching suggestions to foods', () => {
  const food = (id: string, name: string, kind: Food['source']['kind'] = 'usda_fdc', extra: Partial<Food> = {}): Food => ({
    id, name, aliases: [], state: 'prepared', tags: [], source: { kind, name: kind }, per100g: {}, servings: [], revision: 1, ...extra,
  });
  const cat = [food('fdc:1', 'Idli'), food('fdc:2', 'Dosa'), food('c:9', 'Amma idli', 'user'), food('fdc:3', 'Old', 'usda_fdc', { archived: true })];
  const byId = new Map(cat.map((f) => [f.id, f]));
  const idx = new SearchIndex(cat.filter((f) => !f.archived));
  const r = (label: string, targets: unknown[]): Ranked => ({ label, targets: targets as string[], cos: 0.2, score: 0.2 });

  it('maps to catalog foods, adds the user own matches, and offers search when nothing fits', () => {
    const c = toCandidates([r('idli', ['fdc:1']), r('rasam', ['search:rasam']), r('momos', [])], byId, idx);
    expect(c[0].foods.map((f) => f.id)).toEqual(['fdc:1']);
    expect(c[0].own.map((f) => f.id)).toEqual(['c:9']);
    expect(c[1]).toMatchObject({ foods: [], search: 'rasam' });
    expect(c[2]).toMatchObject({ foods: [], search: 'momos' });
  });
  it('drops malformed, unknown, archived and duplicate targets', () => {
    const c = toCandidates(
      [r('dosa', ['fdc:2', 'fdc:2', 'fdc:404', 'fdc:3', 42, null]), r('dosa', ['fdc:2']), { label: '', targets: [], cos: 0, score: 0 }, null as unknown as Ranked],
      byId,
      idx,
    );
    expect(c).toHaveLength(1);
    expect(c[0].foods.map((f) => f.id)).toEqual(['fdc:2']);
  });
});
