// Image -> SigLIP pixel tensor (NCHW float32). Pure function on RGBA pixels so it is unit-testable;
// the browser resizes with a canvas first (SigLIP squashes to size, no crop).

export interface PreprocessSpec {
  size: { height: number; width: number };
  rescale: number; // 1/255
  mean: number[];
  std: number[];
}

export function toPixelValues(rgba: Uint8ClampedArray, w: number, h: number, spec: PreprocessSpec): Float32Array {
  if (w !== spec.size.width || h !== spec.size.height) throw new Error(`Expected ${spec.size.width}×${spec.size.height} pixels`);
  if (rgba.length !== w * h * 4) throw new Error('Pixel buffer has the wrong length');
  const plane = w * h;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (rgba[i * 4 + c] * spec.rescale - spec.mean[c]) / spec.std[c];
  }
  return out;
}

/** The deterministic test image used by the CI reference embedding (scripts/vision/build-assets.mjs). */
export function referenceImageRGBA(size: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      px[i] = (x * 255) / (size - 1);
      px[i + 1] = (y * 255) / (size - 1);
      px[i + 2] = ((x + y) % 64) * 4;
      px[i + 3] = 255;
    }
  return px;
}
