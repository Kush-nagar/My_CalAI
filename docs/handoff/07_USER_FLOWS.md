# User journeys and interaction contracts
## Manual food logging
Today → Add → local search → select → quantity/unit → inspect basis/source → meal → save. Use one serving only when a source defines it. Unknown gram conversion remains unknown. Offline flow is identical.

## Indian home recipe
Foods → New recipe → ingredients with raw/cooked state and gram weight → cooked yield/servings → inspect calculation/provenance → save → log portion. Cooking water changes concentration, not energy; discarded oil/liquid/waste requires explicit adjustment.

## Barcode
Add → scan → local match/cache; if enabled and connected, query Open Food Facts → inspect product, package, label data and quality → quantity → save. No match offers custom label entry; never auto-select a similar barcode. Cache retrieval date and source.

## Photo
Add → capture/select → optional hint → local model proposes candidates → correct/add/remove each → choose amount and hidden ingredients when useful → show uncertainty/source → confirm → write diary. If model unavailable, keep photo optional and let manual search continue. No upload.

## Offline/recovery
Offline supports local search, recipes, logs, edits, history, export. Unknown network lookup can retry later; no queued image upload. Migrations transactional and versioned, with pre-migration backup. Restore validates archive/schema/checksums/path/storage in temporary state; current data remains until commit.

## Privacy
Settings → inspect stored data → export/delete images/delete all. Photo retention, health access, network lookup are independent controls. Request permission at point of use and explain direction.

## Invariants
1. No inferred food/portion saved without explicit confirmation.
2. Quantity changes recompute nutrient values from canonical basis.
3. Historical snapshots do not change when catalog changes.
4. Health imports retain source and dedupe by stable ID/time/value.
5. Network failure never blocks logging.
