import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { barcodeCandidates } from './gtin';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { prepareZXingModule as prepareWriter, writeBarcode } from 'zxing-wasm/writer';

// Round-trip: encode retail barcodes with the bundled writer, decode with the same reader build the
// app ships. Proves the formats we rely on decode offline from the local WASM (no CDN).
const require = createRequire(import.meta.url);
const wasm = (p: string) => readFileSync(require.resolve(p));

describe('zxing-wasm reader (local wasm)', () => {
  it('decodes EAN-13, EAN-8 and UPC-A', async () => {
    const readerWasm = wasm('zxing-wasm/reader/zxing_reader.wasm');
    const writerWasm = wasm('zxing-wasm/writer/zxing_writer.wasm');
    prepareZXingModule({ overrides: { wasmBinary: readerWasm.buffer.slice(readerWasm.byteOffset, readerWasm.byteOffset + readerWasm.byteLength) as ArrayBuffer } });
    prepareWriter({ overrides: { wasmBinary: writerWasm.buffer.slice(writerWasm.byteOffset, writerWasm.byteOffset + writerWasm.byteLength) as ArrayBuffer } });
    const cases: [string, 'EAN-13' | 'EAN-8' | 'UPC-A'][] = [
      ['8901058000290', 'EAN-13'],
      ['96385074', 'EAN-8'],
      ['036000291452', 'UPC-A'],
    ];
    for (const [text, format] of cases) {
      const { image } = await writeBarcode(text, { format, scale: 4, withQuietZones: true });
      expect(image).toBeTruthy();
      const out = await readBarcodes(image!, { formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'], tryHarder: true });
      expect(barcodeCandidates(out[0]?.text ?? '')).toContain(text); // UPC-A is reported as 0+12 digits
    }
  });
});
