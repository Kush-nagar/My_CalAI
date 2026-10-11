# Photo recognition and portion feasibility
## Pipeline
Image quality → food regions → identity → recipe/ingredient interpretation → mass/volume → nutrition database match → user correction. Classifier label is not grams; a language model may guess plausible ingredients; database match inherits selected-food and portion errors.

## Evidence
A systematic review found varied methods, calorie relative errors roughly 0.1%–38.3%, and no pooled estimate due to heterogeneity; simple foods generally fare better ([review](https://pmc.ncbi.nlm.nih.gov/articles/PMC10836267/)). Hidden oil, recipe ratios, occlusion, mixed dishes, camera angle, plate size, and density are key uncertainty sources. SnapCalorie reports 15% mean error on its proprietary curated 5,000-dish set; this vendor claim does not establish Indian coverage ([FAQ](https://www.snapcalorie.com/faq.html)).

## Model recommendation
Do not select on model name/parameter count. First benchmark lawful candidate model+dataset pairs. Candidate shape: small mobile classifier trained/fine-tuned on cuisine-relevant lawful data, optionally region detector, then local vocabulary and confirmation. [MediaPipe image classification](https://developers.google.com/edge/mediapipe/solutions/vision/image_classifier/android) supports Android inference with a compatible trained model. [Core ML](https://developer.apple.com/documentation/coreml) uses Apple CPU/GPU/Neural Engine. These are runtimes, not ready-made Indian models.
Food-101 is a dataset, not an Indian nutrition database. Audit model license, weights, dataset images, conversion tools, dependencies, and redistribution obligations separately. No production candidate cleared yet.

## UX
Candidates are “possible matches”; allow unknown/manual path, multiple foods, short clarifying questions, editable amount/source. Show calibrated range only after validation; otherwise text: “rough estimate; recipe and oil unknown.” Never fabricate probabilities. Preserve image only if user opts in; delete by default after review.

## Benchmark
Held-out Indian meals across regions, light/utensils, mixed dishes, packages, restaurants, language hints. Record weighed ingredients, cooked yield, leftovers, reference data; split by recipe/session to prevent leakage. Report per-class top-1/top-5, multi-label precision/recall/F1, portion MAE/relative error, nutrient MAE/MAPE/bias, correction and abstention rates, latency, peak RAM, storage and battery. Separate identity, grams, nutrient match, total error. Include confidence intervals and examples. No Cal AI comparison without same blinded protocol.
