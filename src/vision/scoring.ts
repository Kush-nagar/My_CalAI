// Rank our own label list against an image embedding. The model never produces free text,
// so every suggestion maps to a label we wrote and to catalog ids or a search query.

export interface LabelEmbeddings {
  model: string;
  dim: number;
  labels: { label: string; targets: string[] }[];
  scales: number[];
  int8: string; // base64 Int8Array, row-major labels × dim
}

export interface Ranked {
  label: string;
  targets: string[];
  /** Cosine similarity; used only for ordering, never shown. */
  cos: number;
  /** SigLIP sigmoid score; uncalibrated for this task, used only for the "can't tell" gate. */
  score: number;
}

export interface Scorer {
  rank(imageEmbedding: ArrayLike<number>, topK?: number): Ranked[];
}

function b64ToInt8(b64: string): Int8Array {
  const bin = atob(b64);
  const out = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24;
  return out;
}

export function makeScorer(e: LabelEmbeddings, logitScale: number, logitBias: number): Scorer {
  const q = b64ToInt8(e.int8);
  if (q.length !== e.labels.length * e.dim || e.scales.length !== e.labels.length) throw new Error('Label embeddings are malformed');
  const scale = Math.exp(logitScale);
  return {
    rank(img, topK = 5) {
      if (img.length !== e.dim) throw new Error(`Expected a ${e.dim}-dim embedding, got ${img.length}`);
      let n = 0;
      for (let j = 0; j < e.dim; j++) {
        const v = img[j];
        if (!Number.isFinite(v)) throw new Error('Embedding contains invalid numbers');
        n += v * v;
      }
      n = Math.sqrt(n);
      if (!(n > 0)) throw new Error('Embedding is empty');
      const out: Ranked[] = e.labels.map((l, i) => {
        let dot = 0;
        const base = i * e.dim;
        for (let j = 0; j < e.dim; j++) dot += q[base + j] * img[j];
        const cos = (dot * e.scales[i]) / n;
        return { label: l.label, targets: l.targets, cos, score: 1 / (1 + Math.exp(-(scale * cos + logitBias))) };
      });
      out.sort((a, b) => b.cos - a.cos);
      return out.slice(0, topK);
    },
  };
}

/** Merge rankings from several crops (whole photo + parts of a mixed plate): best cosine per label wins. */
export function mergeRankings(lists: Ranked[][], topK = 5): Ranked[] {
  const best = new Map<string, Ranked>();
  for (const l of lists) for (const r of l) if (!best.has(r.label) || best.get(r.label)!.cos < r.cos) best.set(r.label, r);
  return [...best.values()].sort((a, b) => b.cos - a.cos).slice(0, topK);
}

/**
 * Provisional "can't tell" gate. Not validated: the owner's own photo evaluation should tune it
 * (docs/PHOTO_SUGGESTIONS.md). Below it, the UI leads with search instead of suggestions.
 */
export const ABSTAIN_SCORE = 0.001;
export const isUnsure = (r: Ranked[]) => r.length === 0 || r[0].score < ABSTAIN_SCORE;
