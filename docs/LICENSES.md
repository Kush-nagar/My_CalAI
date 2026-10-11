# Licences of bundled data, models and assets

Anything shipped in the app, or used to build what ships, needs a row here before it is bundled
(see CLAUDE.md). Code dependencies are listed in `package.json`.

| Item | Purpose | License | Cost | Offline | Limitations |
|---|---|---|---|---|---|
| USDA FoodData Central: SR Legacy (`FoodData_Central_sr_legacy_food_csv_2018-04.zip`) | 313 seed foods in `src/data/seed/foods.json` (analytical values and portion weights) | Public domain / CC0 1.0. USDA asks to be cited (text in `docs/DATA_SOURCES.md`). | $0 | Yes. Bundled in the app. | Frozen since 2018. US samples and varieties. Some nutrients not reported (stored as null with a reason). |
| USDA FoodData Central: Foundation Foods (`FoodData_Central_foundation_food_csv_2026-04-30.zip`) | 2 seed foods (red rice, buttermilk) | Public domain / CC0 1.0, citation requested | $0 | Yes. Bundled. | Narrow nutrient panel. Energy sometimes only as Atwater factors (noted per food). |
| USDA FoodData Central: FNDDS survey foods (`FoodData_Central_survey_food_csv_2024-10-31.zip`) | 39 prepared dishes (dal, idli, dosa, biryani, samosa, paneer...) | Public domain / CC0 1.0, citation requested | $0 | Yes. Bundled. | Values are calculated from **US standard recipes** and labelled that way. Indian home and restaurant versions differ. |
| Thali template recipes (`scripts/data/curation/templates.mjs`) | 27 home-dish templates calculated from the USDA records above | Derived from CC0 data. The ingredient lists were written by the project curator. | $0 | Yes. Bundled. | Illustrative proportions only. Servings-only (no cooked-yield assumption). Users' recipes will differ. |
| `scripts/data/raw/usda-extract.json.gz` | Build input: compact extract of the three USDA datasets above | Public domain / CC0 1.0 | $0 (fetched by a free GitHub Actions job) | Build-time only; not shipped to users | Holds only the 15 tracked nutrients and portion weights |
| ICMR-NIN IFCT 2017 | **Not used, not bundled** | Redistribution rights unresolved | n/a | n/a | Excluded until rights are confirmed in writing |
| Open Food Facts | **Not bundled.** Runtime barcode lookup only (user-triggered, opt-in) | ODbL (database), DbCL (contents), CC BY-SA (images) | $0 | No (online lookup) | Share-alike terms. Community data of variable quality. Must not be merged into the bundled seed. |
