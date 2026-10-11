# UI/UX design specification
## Navigation
Four destinations: Today, Foods, Trends, Settings. Persistent Add action opens Search/manual (default), Recent/Favorites, Barcode, Photo. Do not hide search behind AI.

## Screens
**Today:** date, grouped meals, nutrient snapshot configurable by user, calm Add action. Empty state invites a first food/meal.
**Food search:** local catalog first; aliases/transliteration; source/type filters; show per-100g basis and source. Online lookup is a separate action.
**Food/portion sheet:** amount, unit, gram equivalent, evidence for conversion, nutrients, source, quality, edit action. Unknown household-measure conversion is never guessed.
**Photo review:** local preview; candidate list marked “possible match”; ask amount in known unit/grams; ask about oil/sauce only if material; add/remove candidates; show interval only if calibrated, otherwise textual caveat; confirm before logging.
**Recipe editor:** ingredients, raw/cooked state, weights, yield, servings; totals from ingredients divided by yield; state assumptions.
**Trends:** user-selected nutrient and meal variety, neutral trends, no red/green judgment or health prediction.
**Settings:** units/language aliases, calorie visibility, privacy, backup, image cleanup, permissions, safety mode, reminders.

## Interaction rules
Food-focused original palette, strong typography, compact rows, high contrast, 44–48 dp/pt targets, dynamic type, semantic labels, reduced motion, one-handed reach. No Cal AI layout/assets copied. Loading state preserves add action. No-match lets user create custom food or recipe. Model unavailable falls back to search. Save errors preserve unsaved form. Charts include text summaries.

## Wellbeing and accessibility
Avoid streak loss, shame, restrictive prompts, body-shape imagery, and “burn it off.” Screen readers announce portion and estimate status. Support color-independent status, large type, locale digits, long names/transliterations. Allow calories hidden.

## Proposed workflow budgets (targets, not measured)
Re-log recent meal ≤3 taps after Today loads; known food search/add ≤5 deliberate actions; correction after processing ≤30 seconds median. Validate on real device. Speed targets never bypass review.
