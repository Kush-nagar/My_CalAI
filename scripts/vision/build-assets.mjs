// Build the on-device photo suggestion assets. Runs in GitHub Actions (the dev container cannot reach
// huggingface.co). Needs `npm i --no-save @huggingface/transformers@4.3.1` first.
//
// Outputs (committed by the workflow):
//   public/models/siglip2-b16-224/vision_model_q4.onnx   SigLIP2 image encoder, 4-bit (Apache-2.0)
//   public/models/siglip2-b16-224/{config,preprocessor_config}.json, LICENSE, NOTICE
//   src/vision/assets.json        pinned revision, file sizes, SHA-256, preprocessing, logit scale/bias
//   src/vision/label-embeddings.json   text embeddings of our own label prompts (int8 + per-row scale)
//   tests/fixtures/vision-reference.json  reference image embedding for the browser pipeline test
//
// The text encoder and tokenizer are used only here; they never ship to the phone.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO = 'onnx-community/siglip2-base-patch16-224-ONNX';
const BASE_REPO = 'google/siglip2-base-patch16-224';
const VISION_FILE = 'onnx/vision_model_q4.onnx';
const VISION_SHA256 = '03e61be280fb24114facd87a1e1e6b2b654aad49845686da2f930c72740914aa';
const OUT_DIR = 'public/models/siglip2-b16-224';
const HF = 'https://huggingface.co';

async function retry(fn, tries = 5) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      console.log(`attempt ${i} failed: ${e.message}; retrying`);
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
}
const getJson = (url) => retry(async () => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); });
const getBuf = (url, headers) => retry(async () => { const r = await fetch(url, { headers }); if (!r.ok) throw new Error(`${r.status} ${url}`); return Buffer.from(await r.arrayBuffer()); });
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const write = (p, data) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); };

// 1. Pin revisions.
const info = await getJson(`${HF}/api/models/${REPO}`);
const baseInfo = await getJson(`${HF}/api/models/${BASE_REPO}`);
const rev = info.sha;
const baseRev = baseInfo.sha;
console.log('revision', REPO, rev, BASE_REPO, baseRev, 'license', baseInfo.cardData?.license);
if (baseInfo.cardData?.license !== 'apache-2.0') throw new Error('Base model licence is no longer apache-2.0; stop and re-review');
const resolve = (repo, r, f) => `${HF}/${repo}/resolve/${r}/${f}`;

// 2. Vision model + configs, verified.
const vision = await getBuf(resolve(REPO, rev, VISION_FILE));
if (sha256(vision) !== VISION_SHA256) throw new Error(`vision model checksum changed: ${sha256(vision)}`);
const config = await getBuf(resolve(REPO, rev, 'config.json'));
const pre = await getBuf(resolve(REPO, rev, 'preprocessor_config.json'));
const preJson = JSON.parse(pre.toString());
console.log('preprocessor', preJson);
const licenseText = await getBuf('https://www.apache.org/licenses/LICENSE-2.0.txt');
write(`${OUT_DIR}/vision_model_q4.onnx`, vision);
write(`${OUT_DIR}/config.json`, config);
write(`${OUT_DIR}/preprocessor_config.json`, pre);
write(`${OUT_DIR}/LICENSE`, licenseText);
write(
  `${OUT_DIR}/NOTICE`,
  `SigLIP 2 (${BASE_REPO}, revision ${baseRev}) by Google, licensed under the Apache License 2.0.\n` +
    `ONNX conversion: ${REPO} (revision ${rev}).\n` +
    `Modified: 4-bit quantized ONNX export of the vision encoder only (file ${VISION_FILE}).\n` +
    `Thali uses it unchanged to compute image embeddings on the user's device.\n`,
);

// 3. logit_scale / logit_bias from the base safetensors header (HTTP range, a few bytes only).
async function readScalars() {
  const url = resolve(BASE_REPO, baseRev, 'model.safetensors');
  const head = await getBuf(url, { Range: 'bytes=0-7' });
  const n = Number(head.readBigUInt64LE(0));
  const hdr = JSON.parse((await getBuf(url, { Range: `bytes=8-${8 + n - 1}` })).toString());
  const out = {};
  for (const k of ['logit_scale', 'logit_bias']) {
    const t = hdr[k];
    if (!t) throw new Error(`missing ${k}`);
    const [s, e] = t.data_offsets;
    const b = await getBuf(url, { Range: `bytes=${8 + n + s}-${8 + n + e - 1}` });
    if (t.dtype !== 'F32') throw new Error(`${k} dtype ${t.dtype}`);
    out[k] = b.readFloatLE(0);
  }
  return out;
}
const { logit_scale, logit_bias } = await readScalars();
console.log('logit_scale', logit_scale, 'exp', Math.exp(logit_scale), 'bias', logit_bias);

// 4. Label text embeddings (prompt ensemble; SigLIP2 expects lowercase text, padded to 64 tokens).
const T = await import('@huggingface/transformers');
T.env.allowLocalModels = false;
const tokenizer = await T.AutoTokenizer.from_pretrained(REPO, { revision: rev });
let textModel;
for (const dtype of ['fp32', 'fp16']) {
  try {
    textModel = await T.SiglipTextModel.from_pretrained(REPO, { revision: rev, dtype });
    console.log('text model dtype', dtype);
    break;
  } catch (e) {
    console.log('text model', dtype, 'failed:', e.message);
  }
}
if (!textModel) throw new Error('no text model');
const labels = JSON.parse(readFileSync('scripts/vision/labels.json', 'utf8'));
const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
async function embedTexts(texts) {
  const inputs = tokenizer(texts.map((t) => t.toLowerCase()), { padding: 'max_length', truncation: true, max_length: 64 });
  const { pooler_output } = await textModel(inputs);
  const [n, d] = pooler_output.dims;
  const data = pooler_output.data;
  return Array.from({ length: n }, (_, i) => norm(Array.from(data.slice(i * d, (i + 1) * d))));
}
const rows = [];
for (const l of labels) {
  const vs = await embedTexts([`this is a photo of ${l.label}.`, l.prompt]);
  rows.push(norm(vs[0].map((x, i) => x + vs[1][i])));
}
const dim = rows[0].length;
const scales = rows.map((r) => Math.max(...r.map(Math.abs)) / 127);
const q = new Int8Array(rows.length * dim);
rows.forEach((r, i) => r.forEach((x, j) => (q[i * dim + j] = Math.round(x / scales[i]))));
write(
  'src/vision/label-embeddings.json',
  JSON.stringify({
    model: `${REPO}@${rev}`,
    dim,
    labels: labels.map(({ label, targets }) => ({ label, targets })),
    scales: scales.map((s) => +s.toPrecision(7)),
    int8: Buffer.from(q.buffer).toString('base64'),
  }) + '\n',
);

// 5. Reference image embedding through the official processor + the same q4 model.
// The test image is a formula (see src/vision/testImage.ts) so the browser can redraw it exactly.
const S = 224;
const px = new Uint8ClampedArray(S * S * 3);
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 3;
    px[i] = (x * 255) / (S - 1);
    px[i + 1] = (y * 255) / (S - 1);
    px[i + 2] = ((x + y) % 64) * 4;
  }
const image = new T.RawImage(px, S, S, 3);
const processor = await T.AutoProcessor.from_pretrained(REPO, { revision: rev });
const visionModel = await T.SiglipVisionModel.from_pretrained(REPO, { revision: rev, dtype: 'q4' });
const { pixel_values } = await processor(image);
const { pooler_output } = await visionModel({ pixel_values });
const ref = norm(Array.from(pooler_output.data));
write('tests/fixtures/vision-reference.json', JSON.stringify({ size: S, embedding: ref.map((x) => +x.toFixed(6)) }) + '\n');

// 6. Manifest for the app.
const files = [
  { path: 'vision_model_q4.onnx', bytes: vision.length, sha256: sha256(vision) },
  { path: 'preprocessor_config.json', bytes: pre.length, sha256: sha256(pre) },
];
write(
  'src/vision/assets.json',
  JSON.stringify(
    {
      id: 'siglip2-b16-224-q4',
      repo: REPO,
      revision: rev,
      baseRepo: BASE_REPO,
      baseRevision: baseRev,
      license: 'Apache-2.0',
      retrievedAt: new Date().toISOString(),
      files,
      preprocess: {
        size: preJson.size,
        rescale: preJson.rescale_factor,
        mean: preJson.image_mean,
        std: preJson.image_std,
        resample: preJson.resample,
      },
      logitScale: logit_scale,
      logitBias: logit_bias,
    },
    null,
    2,
  ) + '\n',
);
console.log('done', files);
