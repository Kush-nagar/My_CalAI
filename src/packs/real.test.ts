import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { PackIndex, rowToFood } from './format';

// Runs only where real packs were built (CI "Food packs check"); skipped in normal test runs.
const dirs = ['usda-branded', 'off-india', 'off-world'].filter((d) => existsSync(`public/packs/${d}/00.txt`));

describe.skipIf(!dirs.length)('real food packs', () => {
  it('builds, searches and resolves barcodes on the full data', () => {
    const mem0 = process.memoryUsage().heapUsed;
    let t = performance.now();
    const p = new PackIndex();
    for (const d of dirs) for (const f of readdirSync(`public/packs/${d}`).filter((x) => x.endsWith('.txt') && /^\d+/.test(x)).sort()) p.addShard(d, readFileSync(`public/packs/${d}/${f}`, 'utf8'));
    p.build();
    const buildMs = performance.now() - t;
    const memMb = (process.memoryUsage().heapUsed - mem0) / 1e6;
    console.log(`rows ${p.size}, build ${buildMs.toFixed(0)} ms, heap +${memMb.toFixed(0)} MB`);
    for (const q of ['cheerios', 'chobani greek yogurt', 'protein bar', 'coca cola', 'amul butter', 'maggi noodles', 'nutella', 'oreo', 'quest bar', 'fairlife milk']) {
      t = performance.now();
      const r = p.search(q, 5);
      console.log(`${q.padEnd(22)} ${(performance.now() - t).toFixed(1).padStart(6)} ms  ${r.map((x) => rowToFood(x).name.slice(0, 50)).join(' | ')}`);
    }
    const anyGtin = p.search('cheerios', 1)[0]?.gtin;
    if (anyGtin) expect(p.byBarcode(anyGtin)?.gtin).toBe(anyGtin);
    expect(p.size).toBeGreaterThan(1000);
  });
});
