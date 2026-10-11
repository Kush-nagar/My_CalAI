# Nutrition data and Indian food coverage
## Source assessment
**ICMR-NIN IFCT 2017:** Indian analytical reference for many raw ingredients; official text says most values are raw foods. It is not an exhaustive cooked-recipe catalog. Public PDF availability does not establish blanket rights for bulk extraction/repackaging; confirm rights before distributing derived records. [Official IFCT](https://www.nin.res.in/ebooks/IFCT2017.pdf), [FAO record](https://www.fao.org/food-composition/tables-and-databases/detail/%28country--date%29-title-9/en).
**USDA FoodData Central:** API/downloads; public domain/CC0, attribution requested. API key required; default 1,000 requests/hour/IP. Search and details endpoints; keep key private. [API/license](https://fdc.nal.usda.gov/api-guide/), [downloads](https://fdc.nal.usda.gov/download-datasets/).
**Open Food Facts:** useful barcode/branded source; community contributed, quality varies. Database ODbL, contents Database Contents License, images CC BY-SA; custom User-Agent and v3 docs; review attribution/share-alike terms. Avoid combining with closed data for redistribution. [API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/), [license/quality](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md).
**Restaurants:** use official published nutrition with date/region; otherwise user recipe or clearly labeled estimate. No complete, lawful free restaurant API was established.

## Record and search
Store source/source ID/edition, name and aliases, language/region, food state, edible basis, nutrients and units, method, serving conversions and evidence, quality flags, license, retrieval date, revision. Keep source records immutable; edits create personal overrides. Missing is null with reason, never zero. Search normalized Unicode, transliteration, aliases, regional label, ingredient; exact and source quality rank before fuzzy match. Show state/source in result. Canonical mass grams; volume only with known density. Household measures convert only with evidence or user calibration. Distinguish raw, cooked, drained, edible, recipe yield, and branded serving.

## Coverage plan
Curate licensed staples first: rice, wheat atta, pulses, millets, oils, milk/curd/paneer, vegetables and spices; then recipes across regions, snacks and sweets. Preserve regional variants and language aliases. User recipes use actual ingredient weights and final yield. Never claim completeness or invent a missing nutrient.

## Offline/updates
Bundle only license-cleared compact seed records. Online queries are user-triggered and optional. Cache only what terms permit and retain retrieval date. Diary stores nutrient snapshots so catalog updates do not silently rewrite history. Keep source lineage in export.
