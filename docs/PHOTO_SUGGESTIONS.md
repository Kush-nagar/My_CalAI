# Photo food-name suggestions (optional, on-device)

Status (2026-10-11): implemented and verified in desktop Chromium only. **Not yet tested on an iPhone.**
Until the real-device checklist below passes, treat it as experimental. It is off by default.

## What it does and doesn't do
- After you opt in and download the model, Thali can look at a meal photo **on your device** and list
  a few *possible* food names from its own label list (184 labels: Indian dishes across regions plus
  common global foods). Each name maps to foods already in Thali's catalog, to your own foods and
  recipes with a matching name, or to a search.
- You tick the foods you actually see, then enter the amount for each one on the normal amount screen.
  The amount starts empty. Nothing is saved until you press "Add to …" for each food.
- It never estimates calories, nutrients, portion size, oil, sugar or hidden ingredients. It shows no
  percentages or confidence numbers. Suggestions are in order only.
- If every label scores low, it says it can't tell and offers search first (provisional threshold; see
  Evaluation).
- "Mixed plate or thali" also looks at four overlapping parts of the photo and merges the results.

## Model choice
Selected: **SigLIP 2 base, patch 16, 224 px** (`google/siglip2-base-patch16-224`), **image encoder only**,
4-bit ONNX from `onnx-community/siglip2-base-patch16-224-ONNX`, used as a zero-shot classifier against
text embeddings of our own labels. These are precomputed in CI, so the text model never ships.

Why this and not a chat-style vision model: it is small (63 MB), deterministic, and can only answer with
labels we wrote, which map straight to licensed catalog records. A generative model would need its free
text matched to the catalog anyway and could invent dishes. It would also be 20× larger, with a high
risk of iOS killing the page for memory.

| Candidate | Weights licence | Size (smallest usable) | Browser runtime | iPhone risk | Verdict |
|---|---|---|---|---|---|
| **SigLIP2 base/16-224** (vision q4) | Apache-2.0 ([card](https://huggingface.co/google/siglip2-base-patch16-224)) | 63 MB | ORT-web WASM/WebGPU | Low | **Selected** |
| SigLIP v1 base/16-224 | Apache-2.0 | 55–99 MB | ORT-web | Low | Backup |
| Qwen3-VL-2B-Instruct (ONNX q4f16) | Apache-2.0 (base); conversion repo untagged | ≈1.37 GB | Transformers.js WebGPU | Very high (memory) | Rejected: size, latency, free text |
| Qwen2.5-VL-3B | `qwen-research` (non-commercial) | >2 GB | — | Very high | Rejected: licence + size |
| SmolVLM-256M/500M | Apache-2.0 | ≈189 MB+ | Transformers.js | Medium | Runner-up; free English text, weak on Indian names |
| Florence-2-base | MIT | — | Transformers.js | Medium | Rejected: captioner, not catalog-oriented |
| Moondream2 | Apache-2.0 | 1.9B params | old ONNX only | High | Rejected |
| LFM2-VL / LFM2.5-VL | `lfm1.0` (other) | — | Transformers.js | Medium | Rejected: custom licence |
| FastVLM, MobileCLIP 1/2 | Apple ML research licence | — | — | — | Rejected: research use only |
| Janus-Pro-1B | DeepSeek Model License (pass-through use restrictions) | — | — | High | Rejected |
| Gemma 3n / PaliGemma | Gemma Terms (pass-through, remote restriction clause) | multi-GB | — | Very high | Rejected |
| OpenAI CLIP, OpenCLIP-LAION | Code MIT; model cards: "any deployed use … out of scope" | — | — | — | Rejected |
| Food-101 fine-tunes | Model tagged Apache-2.0; dataset images "beyond scientific fair use must be negotiated" | — | — | — | Rejected: data rights, few Indian classes |

## Licence chain (all permit use and redistribution in this personal app)
| Component | Licence | Evidence | Where |
|---|---|---|---|
| SigLIP 2 weights, revision `75de2d55ec2d…` | Apache-2.0 | HF card `license: apache-2.0`, re-checked by the CI job (fails if it changes) | `public/models/siglip2-b16-224/` with `LICENSE` and `NOTICE` (modification statement) |
| ONNX conversion `onnx-community/…-ONNX`, revision `ba1f3b0843f2…` | Untagged; treated as an Apache-2.0 derivative of the above | `src/vision/assets.json` pins revision and SHA-256 `03e61be2…` | same |
| Label text embeddings | Derived from the Apache-2.0 model + our own label text | `scripts/vision/build-assets.mjs` | `src/vision/label-embeddings.json` |
| onnxruntime-web 1.30.0 | MIT | npm `license: MIT` (no LICENSE file in tarball, so the text and Third Party Notices are shipped) | `public/ort/LICENSE.txt`, `public/ort/ThirdPartyNotices.txt` |
| Training data (WebLI) | Not released; Google's terms not needed to use the Apache-2.0 weights | Not redistributed | — |
| Food images | **None used.** No scraping, no datasets, no IFCT. | — | — |

## Size and storage
- Download on opt-in: **≈90 MB** (model 63.3 MB + runtime WASM 26.8 MB), shown before downloading.
- Stored in Cache Storage bucket `model-cache:siglip2-b16-224-q4@<revision>`. The name deliberately doesn't
  start with `thali-`, because the service worker clears old `thali-*` caches on each update.
- The files are served by Thali's own site (`models/`, `ort/`). They are **not** precached for everyone
  and never come from a CDN or Hugging Face at runtime.
- Each file is checked against its pinned size and SHA-256 before it is stored. A cancelled or failed
  download keeps only fully verified files, so a retry continues file by file.
- Remove: Settings, Photo suggestions, **Remove model** (deletes every revision).

## Privacy: does the photo leave the device? No.
Evidence:
1. Inference runs in a same-origin Web Worker (`src/vision/worker.ts`). It reads the model and WASM bytes
   from Cache Storage (`env.wasm.wasmBinary`) and makes no network requests.
2. The CSP (`index.html`) allows connections only to the app's own origin and Open Food Facts (barcode,
   opt-in). The model download is same-origin. No CSP change was needed for this feature.
3. `tests/e2e/photo-suggest.spec.ts` records every request. Model requests are same-origin only. While
   offline, suggestion and logging make no request to any other origin. Nothing model-related is
   requested or precached before opt-in.
4. The photo is re-encoded locally (EXIF stripped) and kept only if "Keep meal photos" is on.

## Verified so far (desktop Chromium, 2026-10-11)
- In-browser embedding matches the CI reference from the official SigLIP2 processor + same weights:
  cosine 0.9999999 (`npm run test:vision`).
- Timing in this cloud container (Chromium, WASM, single thread): model load 1.3–1.6 s, one image
  2.2–3.0 s. **This says nothing about iPhone performance.**
- Recognition accuracy on real food photos: **not measured**. No food photos were available, and none
  were scraped.

## Known weaknesses
- Zero-shot on Indian food is unproven. Expect confusion between look-alikes: dal/sambar/rasam/kadhi,
  roti/paratha/naan, biryani/pulao, idli/uttapam, paneer gravies, brown or red curries, and sweets in syrup.
- Mixed plates: one embedding per crop. Small items in a thali may be missed even with "Mixed plate".
- Portion size, oil, sugar, ghee and hidden ingredients can't be seen in a photo and are never estimated.
- 62 of the 184 labels have no catalog record (for example rasam, pav bhaji, momos), so they lead to search
  or "create custom food".
- The "can't tell" threshold is provisional and untuned.

## Evaluation plan (owner, about 2 weeks, no scraping)
Photograph 40–60 of your own meals in varied light, including thalis and restaurant food. Write the true
dish names first, then run suggestions. For each category (South breakfast, breads, rice dishes, dals/
curries, sweets, drinks, fruit, other), record top-1 and top-3 hits, "can't tell" rate, wrong suggestions,
and seconds to a confirmed name. Report Wilson 95% intervals (n≈50 gives about ±14 points). To recommend
it in setup, top-3 should be ≥80% overall with the lower bound ≥70% and no category below 50%. The
correction time should also be faster than plain search. Either way it stays optional.

## Real-iPhone checklist (required before calling it working)
1. Record the iPhone model and iOS version (Settings › General › About).
2. Install from Safari to the Home Screen and open from the icon.
3. Settings › Photo suggestions › Set up: note the size shown, then download on Wi-Fi. Note the time.
4. During the download, switch apps for 30 s, come back, and note what happened. Then try Cancel, and
   Download again.
5. When ready, turn on **Airplane mode**, close Thali fully, and reopen from the icon.
6. Add › Photo › take a photo of a real meal › Suggest food names. Note the seconds until the list appears.
7. Repeat with 10 different meals. Watch for the app reloading by itself (iOS killed it for memory).
8. Try "Mixed plate or thali" on a thali photo. Note the time.
9. Confirm one suggestion, enter an amount, save, and check it in Today.
10. Settings › Remove model. Check that the Photo tab still lets you attach a photo and search.
11. Next day: check whether the model is still installed (or shows "no longer on this device").

Report results (device, iOS, size, download time, per-photo time, any reloads) so the feature can be
judged. If the page crashes or a photo takes much longer than search, leave it off.
