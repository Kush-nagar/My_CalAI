# Product requirements
## Definition
A single-owner food journal for someone eating diverse Indian foods. Make reliable manual logging quick, keep history on-device, work offline, and make AI correctable. Not a medical device, clinical diet plan, weight-loss prescription, or social product.

## User jobs
Understand what foods contribute nutrients; record meals offline; calculate home recipes from ingredient quantities; find foods by common English/regional/transliterated names; correct entries; export/restore safely.

## Priorities
**P0:** local diary; date/meal grouping; food search; editable quantities/units; nutrient totals with source/basis; custom foods and recipe calculator; recents/favorites; local backup/export/restore; optional local photo attachment; offline-first; privacy controls; accessible controls.
**P1:** barcode lookup (online OFF plus cache); photo candidates after feasibility gate; trends; optional HealthKit/Health Connect; opt-in reminders.
**Out of scope:** accounts, subscriptions, cloud sync, social sharing, public release, paid API, body comparison, calorie-burn subtraction, automatic weight-loss targets.

## Indian coverage
Layer sources without claiming completeness: IFCT 2017 analytical values for allowed raw ingredients; USDA FDC for complementary generic/branded foods; Open Food Facts for packaged products after ODbL review; user recipes from ingredient weights/yield; custom foods, aliases, measures, language/region tags. Missing values are not fabricated.
Vocabulary should cover idli/dosa/uttapam, dal varieties, khichdi, sabzi, roti/paratha, rice dishes, chutneys, snacks, sweets, and regional variants through names and recipe composition. Similar names are not assumed equivalent.

## Safety
For users under 18 disable calorie targets, weight-loss goals, deficit messaging, body comparison, punitive food scoring/streaks, exercise-to-earn-food, and pressure notifications. Focus on food composition, variety, hydration, rest, enjoyment; encourage clinician/caregiver guidance. Adult users may hide calories. No diagnosis or medical advice. See [AAP resources](https://www.aap.org/en/patient-care/institute-for-healthy-childhood-weight/aap-policy-statements-on-obesity/) and [ICMR-NIN 2024 guidance](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI07052024P.pdf).

## Acceptance criteria
- Meal add/edit/delete works offline; totals recompute deterministically.
- Every value traces to a source, user edit, or recipe calculation.
- Estimates are visibly estimates.
- No API key or personal meal content is sent to external services.
- User can export and restore without a server.
- Primary flows work with screen readers and text scaling.
- Stale/unavailable lookup never blocks diary edits.
