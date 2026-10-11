// Camera barcode decoding for EAN-13/EAN-8/UPC-A/UPC-E. iOS Safari has no BarcodeDetector, so we
// use zxing-wasm (zxing-cpp compiled to WASM), reader-only build, WASM bundled locally by Vite.
// This module is only imported (dynamically) when the barcode sheet opens.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

type ReaderMod = typeof import('zxing-wasm/reader');
let mod: Promise<ReaderMod> | null = null;

export function loadDecoder(): Promise<ReaderMod> {
  mod ??= import('zxing-wasm/reader').then((m) => {
    // Default would fetch the WASM from a CDN; point it at our own copy (CSP: 'self' only).
    m.prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
      fireImmediately: false,
    });
    return m;
  });
  return mod;
}

const FORMATS = ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'] as const;

/** Decode one frame. Returns the digits of the first retail barcode found, else null. */
export async function decodeFrame(image: ImageData): Promise<string | null> {
  const m = await loadDecoder();
  const results = await m.readBarcodes(image, {
    formats: [...FORMATS],
    tryHarder: true,
    tryRotate: true,
    maxNumberOfSymbols: 1,
  });
  const hit = results.find((r) => r.isValid && /^\d{8,14}$/.test(r.text));
  return hit ? hit.text : null;
}
