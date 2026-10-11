# Local database and interface specification
No server API is required; these are local repository contracts.

## Entities
**Food:** id, display_name, normalized_name, aliases, source_id/source_record_id, food_state, region/language tags, edible basis, nutrients, quality, license, source date.
**NutrientValue:** nutrient code, amount, unit, per-basis grams, value kind (measured/label/calculated/user), missing reason.
**ServingConversion:** food id, label, grams or mL, evidence/source, locale, verified flag; no conversion means unknown.
**Recipe:** id, name, ingredient records with food state and grams, cooked yield, servings, method note, version.
**MealEntry:** id, local time and UTC instant, meal slot, food/recipe snapshot, amount, nutrient snapshot, provenance, estimate status, optional image and note.
**ImageAsset:** id, relative app-private path, MIME, dimensions, capture time, retention state, checksum.
**ExternalLookupCache:** source, external id, fetched time, allowed subset, ETag.
**HealthImport:** source, external ID, type, interval, value/unit, sync time, dedupe key.
**MigrationMetadata:** schema version and pre-migration export state.

## Invariants and math
Diary snapshots prevent upstream catalog edits rewriting history. Missing is null with reason, not zero. Every amount has unit/basis; conversion has provenance. Recipe nutrient = sum(ingredient nutrient per 100g × grams/100), divided by cooked yield or servings. Preserve source rounding and round display only. If values are missing, total is marked incomplete. Every write is transactional; deleting catalog item with references preserves snapshots. Health imports dedupe by stable external ID/time/value. Preserve timezone offset and UTC instant.

## Local interfaces
searchLocal(query, filters, locale); lookupBarcode(code, onlineConsent); createCustomFood; calculateRecipe; addMealEntry(snapshot); editEntry; exportArchive; validateRestore; commitRestore. Validate string lengths, numeric bounds, units, barcode, paths, archive size, and imported JSON at repository boundary.

## Backup
Versioned archive: manifest, SQLite or normalized data, media, provenance, checksums, schema version, timestamp, encryption metadata. Restore validates archive size, paths, checksums, schema and encryption in temporary storage, shows summary, keeps current snapshot until commit, then atomic replacement. Offer data-only export without images.
