// Shared helpers for building offline "food packs" (USDA FDC Branded, Open Food Facts).
// Pack format (consumed by src/packs/): UTF-8 TSV shards, one product per line:
//   gtin  name  brand  kcal  protein  carb  fat  fiber  sugars  satfat  sodium_mg  basis  serving_qty  serving_label  ref
// Numbers are per 100 g (basis "g") or per 100 ml (basis "ml"); empty = not reported (never 0).
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

export const COLUMNS = ['gtin', 'name', 'brand', 'kcal', 'protein', 'carb', 'fat', 'fiber', 'sugars', 'satfat', 'sodium_mg', 'basis', 'serving_qty', 'serving_label', 'ref'];

const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? String(Number(n.toPrecision(4))) : '';
};

/** Plausibility per 100 g/ml. Rows failing it are dropped, not "fixed". */
export function plausible(r) {
  const k = r.kcal === '' ? null : Number(r.kcal);
  const m = ['protein', 'carb', 'fat'].map((c) => (r[c] === '' ? null : Number(r[c])));
  if (k === null && m.some((x) => x === null)) return false; // need energy or all three macros
  if (k !== null && k > 950) return false;
  if (m.some((x) => x !== null && x > 100)) return false;
  if (m.every((x) => x !== null) && m[0] + m[1] + m[2] > 105) return false;
  // Energy consistent with macros (Atwater 4/4/9) within a generous margin when all are present.
  if (k !== null && m.every((x) => x !== null)) {
    const est = m[0] * 4 + m[1] * 4 + m[2] * 9;
    if (est > 30 && Math.abs(est - k) > Math.max(60, 0.35 * k)) return false;
  }
  return true;
}

export function toLine(r) {
  return [
    clean(r.gtin).replace(/\D/g, ''),
    clean(r.name).slice(0, 120),
    clean(r.brand).slice(0, 60),
    num(r.kcal), num(r.protein), num(r.carb), num(r.fat), num(r.fiber), num(r.sugars), num(r.satfat), num(r.sodium_mg),
    r.basis === 'ml' ? 'ml' : 'g',
    num(r.serving_qty),
    clean(r.serving_label).slice(0, 60),
    clean(r.ref),
  ].join('\t');
}

/** Write rows as shards + return manifest entry. */
export function writePack({ id, name, description, source, license, attribution, url, version, rows, outDir, shardRows = 40000 }) {
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (let i = 0, n = 0; i < rows.length; i += shardRows, n++) {
    const body = COLUMNS.join('\t') + '\n' + rows.slice(i, i + shardRows).map(toLine).join('\n') + '\n';
    const buf = Buffer.from(body, 'utf8');
    const file = `${String(n).padStart(2, '0')}.txt`;
    writeFileSync(`${outDir}/${file}`, buf);
    files.push({ path: `packs/${id}/${file}`, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
  }
  writeFileSync(`${outDir}/LICENSE.txt`, `${name}\nSource: ${source} (${url})\nLicence: ${license}\n${attribution}\n`);
  return { id, name, description, source, license, attribution, url, version, rows: rows.length, files };
}

/** Streaming CSV/TSV reader with quoted-field support (CSV) or plain tabs (TSV). */
export async function eachRow(file, onRow, { tsv = false, gz = false } = {}) {
  const input = gz ? createReadStream(file).pipe(createGunzip()) : createReadStream(file);
  const rl = createInterface({ input, crlfDelay: Infinity });
  let header = null;
  let buf = '';
  let n = 0;
  for await (const line of rl) {
    if (tsv) {
      const cells = line.split('\t');
      if (!header) { header = cells.map((h) => h.replace(/^﻿/, '')); continue; }
      const o = {};
      for (let i = 0; i < header.length; i++) o[header[i]] = cells[i] ?? '';
      onRow(o); n++;
      continue;
    }
    buf = buf ? buf + '\n' + line : line;
    if ((buf.match(/"/g)?.length ?? 0) % 2) continue;
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (q) { if (c === '"' && buf[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
    }
    cells.push(cur);
    buf = '';
    if (!header) { header = cells.map((h) => h.replace(/^﻿/, '')); continue; }
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = cells[i] ?? '';
    onRow(o); n++;
  }
  return n;
}
