# Data sources: bundled seed catalog

The app ships one offline food catalog, `src/data/seed/foods.json`. It holds **381 foods**:
354 USDA FoodData Central records and 27 template recipes calculated from them. Nothing else
is bundled. This file covers where the data comes from, its licence, how it is built, how aliases
were chosen and what is missing.

## Sources and licences

| Source | Used for | Licence | Version bundled |
|---|---|---|---|
| USDA FoodData Central, **SR Legacy** | Analytical values for raw and cooked staples | Public domain / CC0 1.0. USDA asks to be cited. | `FoodData_Central_sr_legacy_food_csv_2018-04.zip` (final SR release, April 2018) |
| USDA FoodData Central, **Foundation Foods** | 2 records with no SR equivalent (red rice, US cultured buttermilk) | Public domain / CC0 1.0 | `FoodData_Central_foundation_food_csv_2026-04-30.zip` |
| USDA FoodData Central, **FNDDS** (survey foods) | Prepared dishes as US survey recipes (dal, idli, dosa, biryani, samosa...) | Public domain / CC0 1.0 | `FoodData_Central_survey_food_csv_2024-10-31.zip` |
| Thali template recipes | 27 home dishes, calculated from the USDA records above | Derived from CC0 data. The ingredient lists were written by the curator. | `scripts/data/curation/templates.mjs` |

The CSVs were downloaded from <https://fdc.nal.usda.gov/download-datasets/> on 2026-10-11 by
the GitHub Actions workflow `.github/workflows/usda-extract.yml` (`scripts/data/fetch-usda.mjs`).
The workflow commits a compact extract to `scripts/data/raw/usda-extract.json.gz`. The extract holds
the 15 tracked nutrients and the portion weights for 13,694 foods.

### Citation (requested by USDA)

> U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019 (SR Legacy
> April 2018; Foundation Foods April 2026; FNDDS survey foods October 2024). fdc.nal.usda.gov.

Every food also stores its own provenance:

- `source.name`
- `source.recordId` (the FDC id)
- `source.edition` (the zip file)
- `source.license`
- `source.retrievedAt`
- `source.url` (the FDC food-details page)
- `notes`, which carries the original USDA description

## Build (reproducible)

```
node scripts/data/build-seed.mjs   # reads scripts/data/raw/usda-extract.json.gz + scripts/data/curation/*
```

- **Curation inputs.** `scripts/data/curation/foods.mjs` pins every food to an FDC id and to its exact
  USDA description. The build fails if either one drifts or cannot be found. The same file holds the
  display names, aliases, tags and notes.
- **Templates.** `scripts/data/curation/templates.mjs` lists each template's ingredients by gram weight.
- **Pure logic.** The build logic lives in `scripts/data/seed-lib.mjs`, which does no I/O. It is
  unit-tested against a synthetic fixture in `src/data/build-seed.test.ts`. The built catalog is
  validated by `src/data/seed.test.ts`.
- **Determinism.** `generatedAt` is the extract's retrieval time, so the same inputs always produce
  a byte-identical `foods.json`.

### Mapping rules

- **Nutrients.** All 15 `NutrientCode`s are present on every food. A value is a number only when
  USDA reports one, and a reported 0 stays 0. Anything else is
  `{ amount: null, missingReason: "Not reported by USDA <dataset>" }`. Nothing is filled with 0.
- **Value kind.** SR Legacy and Foundation values are marked `measured`. FNDDS values and template
  values are marked `calculated`.
- **Foundation energy.** Some Foundation foods have no 1008 energy value. For these the build uses
  Atwater-specific energy (2048), or Atwater-general energy (2047) if 2048 is also missing, and says
  so in `notes`. This applies to red rice and buttermilk.
- **Servings.** Servings come only from USDA `food_portion` gram weights, with evidence like
  `USDA FDC 169910 portion: 1 cup pieces = 165 g`. The build drops:
  - labels that are undetermined, "Quantity not specified", guideline amounts or surface-inch;
  - "yields" labels and bone-and-skin labels;
  - duplicates;
  - FNDDS cup sizes that would mislead (US "small/medium/large" tea and naan sizes).

  No katori, roti or spoon weights were invented. Five foods have no USDA portions and are logged in
  grams only: SR ghee, papad, red rice, buttermilk and ramphal.
- **FNDDS dishes.** These are labelled "USDA FNDDS (US survey recipe)". Their notes say the values
  reflect a US standard recipe and that home and restaurant versions in India vary widely.
- **Templates.** Each template is calculated as Σ(ingredient per-100 g × grams) ÷ servings. This
  mirrors `calculateRecipe()`/`recipeAsFood()`, and the test suite recomputes every template with the
  real domain functions.
  - **No yield assumption.** Templates make no cooked-yield assumption, because water uptake and loss
    vary too much. They use `portionMode: 'servings_only'`: one serving is 1/N of the batch.
  - **Notes.** The notes list every ingredient weight, say that no yield was assumed, and say that
    the user's recipe will differ.
  - **Omissions.** Cooking water is not listed. Asafoetida and curry leaves are omitted because USDA
    has no record for them.

## Counts

By primary category (first tag) and dataset:

| Category | SR Legacy | FNDDS | Foundation | Total |
|---|---:|---:|---:|---:|
| Grains, flours, breads | 43 | 0 | 1 | 44 |
| Pulses | 31 | 0 | 0 | 31 |
| Vegetables (incl. leafy, herbs, roots) | 81 | 0 | 0 | 81 |
| Fruits | 39 | 0 | 0 | 39 |
| Dairy | 18 | 2 | 1 | 21 |
| Eggs | 6 | 0 | 0 | 6 |
| Oils | 10 | 0 | 0 | 10 |
| Nuts and seeds | 19 | 0 | 0 | 19 |
| Spices and condiments | 23 | 1 | 0 | 24 |
| Sweets and sugar | 7 | 2 | 0 | 9 |
| Beverages | 5 | 1 | 0 | 6 |
| Snacks | 4 | 0 | 0 | 4 |
| Meat | 13 | 0 | 0 | 13 |
| Fish and seafood | 14 | 0 | 0 | 14 |
| Prepared dishes | 0 | 33 | 0 | 33 |
| **USDA total** | **313** | **39** | **2** | **354** |
| Template recipes | | | | 27 |

The 27 templates are:

- **Dals:** dal tadka, masoor dal, sabut moong dal, sambar, rajma, chole, kadhi
- **Rice:** khichdi, jeera rice, veg pulao, curd rice
- **Breakfast:** upma, besan chilla, sabudana khichdi, egg bhurji
- **Vegetables:** aloo sabzi, aloo gobi, bhindi masala, baingan bharta
- **Breads:** roti/phulka, plain paratha, aloo paratha
- **Meat:** chicken curry, mutton (goat) curry
- **Sides and drinks:** cucumber raita, masala chai, sweet lassi

Missing values across the catalog are almost all sugars, which SR Legacy often does not report for
spices, pulses and cooked items. The rest are scattered folate, B12, fibre, vitamin C, saturated fat,
zinc and potassium gaps. Templates inherit these as unknown, so the totals are lower bounds.

## Alias policy

Aliases exist so that people can find a food by the name they actually use.

- **What is included.** English names, Hindi and regional names in Latin transliteration with common
  spellings (toor, tur, tuvar, arhar), and native-script names where the curator was confident:
  Devanagari (Hindi and Marathi), Tamil, Telugu, Kannada, Bengali and Gujarati, plus a little
  Malayalam.
- **Never alias two different foods as equivalent.** If USDA's record is close but not the same, the
  difference goes in `notes` and the Indian name is not aliased. Close-but-different cases include
  whole vs split dal, a US vs an Indian variety, or a related species.
- **Names deliberately not aliased** (each would point at a different food):
  - poha: USDA "poha" is the cape gooseberry
  - makhana: fox nut, not lotus seed
  - tej patta: not bay laurel
  - suran or jimikand: Amorphophallus, not Dioscorea yam
  - ber: Indian jujube, not Chinese jujube
  - amla: not European gooseberry
  - jaggery, gur, vellam: not brown sugar
  - chaas: not US cultured buttermilk
  - toned milk: not US 2% milk
  - chana dal: split desi chickpea, which has no USDA record
  - basmati or sona masuri: generic US rice
  - ragi or bajra: USDA "millet" does not name the species
  - fish: rohu, catla, hilsa, surmai, bangda, pomfret, magur, rawas
  - mosambi: sweet lime, not orange
  - dalia: not bulgur
  - kulfi, pav, matar dal, soya chunks
- **Kept with a note** (the same food with a small caveat):
  - toor, moong and urad: whole mature seed vs split dal
  - besan: USDA labels the record "besan"
  - "mutton": goat meat in Indian usage
  - "custard apple": the sitaphal used in India; USDA's "custard-apple" is ramphal, listed separately
  - nimbu: Persian lime vs key lime
  - makki atta: vs cornmeal
- **Tests.** `src/data/seed.test.ts` fails if any of the forbidden names appear, or if one food's names
  mix two different pulses.

## Known coverage gaps

These have no USDA record, or no record close enough to alias:

- **Grains:** ragi (finger millet), bajra (pearl millet), jowar flakes, poha (flattened rice), murmura
  (puffed rice), basmati- and variety-specific rice, dalia, vermicelli/semiya.
- **Pulses:** split dehusked dals (yellow moong, chana dal, urad dal), kulthi (horse gram), kala chana
  as a separate record. Cooked red masoor has no USDA record. Cooked pulse values are plain boiled,
  with no oil or salt.
- **Vegetables and herbs:**
  - fresh methi leaves, curry leaves, raw jackfruit as a vegetable
  - gourds: ridge gourd, ivy gourd/tindora, pointed gourd/parwal, snake gourd
  - elephant-foot yam, singhara, banana flower/stem
- **Fruit:** amla, mosambi, ber, kokum, wood apple, Indian mango and banana varieties.
- **Dairy and sweets:**
  - dairy: khoa/mawa, chhena, malai, chaas
  - sugars: jaggery, khand
  - sweets: kulfi, rasgulla, gulab jamun, jalebi, halwa, kheer (only firni, barfi and ladoo exist
    in FNDDS)
- **Spices:** asafoetida (hing), ajwain, kalonji, amchur, kasuri methi, garam masala, sambar
  powder. Indian chilli varieties are not separate.
- **Fish:** rohu, catla, hilsa, pomfret, surmai, bangda, Indian oil sardine, Bombay duck.
- **Dishes:** most regional dishes are absent: poha, dhokla, thepla, pav bhaji, chole bhature,
  Kerala and Bengali dishes, regional curries. The FNDDS dishes that do exist are US recipes. Users
  should build their own recipes, starting from the templates.

## Why IFCT 2017 and Open Food Facts are not bundled

- **IFCT 2017 (ICMR-NIN).** This is the best Indian analytical source, but the rights to bulk-extract
  and redistribute it are unresolved. A public PDF does not grant a licence (see
  `docs/handoff/09_NUTRITION_DATA.md`). No IFCT-derived value is bundled or used to fill gaps, and
  the test suite rejects any IFCT mention in sources.
- **Open Food Facts.** OFF is under ODbL, a share-alike licence, and is community-contributed with
  variable quality. Bundling it would add share-alike obligations to the catalog. It stays an opt-in,
  user-triggered barcode lookup at runtime only.

## Worldwide catalog (added 2026-10-13)
`src/data/seed/global.json` holds every other food in the same three USDA FoodData Central releases
(SR Legacy 2018-04, FNDDS 2024-10-31, Foundation 2026-04-30): **13,338 foods** from all cuisines,
including drinks, supplements, fast food and packaged items. It is built by
`scripts/data/build-global.mjs` from `scripts/data/raw/usda-extract.json.gz` with the same nutrient
mapping, missing-value handling (null with reason, never 0) and USDA portion weights as the curated
seed. Names are USDA descriptions; curated and personal foods rank first in search. Licence: CC0 1.0
(public domain), citation requested. FNDDS dishes are US standard recipes and are labelled so.

## Optional offline food databases ("food packs", added 2026-10-13)
Downloaded only when you choose them in Settings › Food databases, from this app's own website, then
searched and barcode-matched on the device. Built fresh at each deploy by `scripts/packs/` (GitHub Actions).

| Pack | Source | Licence | Size (2026-10-13 build) | Notes |
|---|---|---|---|---|
| USDA branded foods | USDA FoodData Central — Branded Foods (`FoodData_Central_branded_food_csv_2026-04-30`) | CC0 1.0 (public domain), citation requested | 431,128 products (from 1,984,629 records), ≈52 MB uncompressed | Manufacturer-submitted label data, mostly US market. Latest record per barcode; discontinued items dropped. |
| Open Food Facts — India | Open Food Facts CSV export | ODbL 1.0 (database), DbCL (contents) | ≈1,700 products with usable nutrition | Community-contributed; quality varies. |
| Open Food Facts — popular worldwide | Open Food Facts CSV export | ODbL 1.0, DbCL | up to 250,000 most-scanned products, excluding US-only items | Community-contributed; quality varies. |

Measured on the full 2026-10-13 build (CI, Node 22): all three packs together = 682,846 products, index
built in ≈1 s, ≈317 MB of memory after garbage collection, searches 6–77 ms. On an iPhone, install only the
packs you need (USDA alone is about two-thirds of that); real-device memory has not been measured yet.

Quality filter (all packs): a product needs energy or all of protein/carbs/fat; energy ≤ 950 kcal/100 g;
each macro ≤ 100 g/100 g; protein+carbs+fat ≤ 105 g; and when all four are present, energy must agree
with 4/4/9 kcal per gram within max(60 kcal, 35%). Failing rows are dropped, never "fixed". Missing
values stay unknown. Liquids labelled per 100 ml are logged by ml servings, never converted to grams.

### Databases that were considered but cannot be used
- **NCC Food and Nutrient Database (NCCDB, University of Minnesota):** licensed case by case for a fee,
  with terms that forbid sharing data beyond the licence scope
  ([licensing](https://www.ncc.umn.edu/products/licensing-the-database)). That conflicts with this app's
  $0 rule and with serving data from a public website. Not used.
- **MyFitnessPal's database:** proprietary and largely user-submitted; there is no licence to reuse it.
  Its generic-food entries largely come from USDA data, which Thali already includes. Not used.
- **Nutritionix, Edamam, FatSecret APIs:** need accounts/API keys, restrict caching, and would send your
  searches to a third party. Not used.
