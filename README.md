# Thali — private food journal for Indian home food

An installable, offline-first web app (PWA) for logging what you eat. No account, no server, no analytics.
Your diary, recipes and photos stay in your browser's storage on your device.

- **Log food fast:** search 381 bundled foods by English, Hindi or regional names and spellings (dal/daal, roti/chapathi,
  भिंडी), recents, favourites, custom foods, and barcode scan.
- **Your recipes:** enter ingredient weights, the weighed cooked yield and servings, and Thali calculates nutrients per
  100 g or per serving, showing its working.
- **Honest numbers:** every value shows where it came from (USDA FoodData Central, package label, your recipe, your
  entry). Unknown values are shown as "—", never as 0. Totals that include unknowns are marked "≥".
- **History stays put:** each diary entry stores a snapshot, so editing a food later doesn't rewrite past days.
- **Backup and restore:** export to Files/iCloud Drive (optionally passphrase-encrypted). Restore is validated before
  anything changes.
- **Safe defaults:** under-18 mode hides calories by default and never shows goals, deficits, streaks or scores. Not
  medical advice.
- **Optional photo suggestions (experimental):** after a one-time ≈90 MB opt-in download, Thali can suggest possible food
  names from a meal photo, entirely on the device (SigLIP 2, Apache-2.0). You pick the food and the amount; nothing is
  saved without your confirmation, and it never guesses calories or portions. Not yet tested on an iPhone; see
  [Photo suggestions](docs/PHOTO_SUGGESTIONS.md). Photos can always be attached as a memory aid.

## Docs
- [Install on iPhone](docs/INSTALL_IPHONE.md) · [Deploy](docs/DEPLOY.md) · [Privacy](docs/PRIVACY.md)
- [Photo suggestions](docs/PHOTO_SUGGESTIONS.md) · [Data sources](docs/DATA_SOURCES.md) · [Licences](docs/LICENSES.md) · [Research handoff](docs/handoff/00_README.md)

## Develop
```
npm install
npm run dev          # local dev server
npm test             # unit tests (vitest)
npm run test:e2e     # Playwright, Chromium
npm run build        # static site in dist/
npm run package      # zip of dist/ for manual upload
```
