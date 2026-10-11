# Cal AI public-product review
Evidence: official US App Store listing, accessed 2026-10-11. No private builds, backend, or source code were inspected.

## Verified
The listing names Cal AI - Calorie Tracker, describes lifestyle questions followed by meal photography and nutritional breakdown, supports iPhone and Apple Watch, and states food-scanning analysis results require a subscription. It currently shows 4.8 stars, 369K ratings, 9+ age rating, 323.2 MB size, and 15 additional languages besides English. These are storefront snapshots, not universal facts. It says it does not provide medical advice. Source: [Apple listing](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616).

## Unknown
The listing does not establish model architecture, training data, portion algorithm, database provenance, offline behavior, inference location, calibrated uncertainty, or meal-level accuracy. Reviews are anecdotes. Exact navigation and screen anatomy cannot be verified from the listing alone. Do not invent private implementation.

## Product pattern
Public promise is low-friction capture: onboarding → photo → nutrition result. Our responsible equivalent: camera/gallery → possible dish candidates → one or two clarifying questions (portion, ingredients/oil) → editable serving and database match → confirm. Recent meals should be faster than repeated AI analysis.

## Screen inventory
| Screen/flow | Evidence status | Note |
|---|---|---|
| Lifestyle/onboarding questions | Verified summary-level | Exact screens and question wording unknown |
| Photo capture and nutrition result | Verified summary-level | Fields, confidence and edits unknown |
| Subscription gate on scan results | Verified | Listing explicitly states this |
| Diary, history, charts, settings | Unknown from listing | Do not claim as verified |
| Correction-first review | Proposal for our app | Show candidate, amount, source, estimate state |

## Design implications
Use public screenshots only as qualitative references, not pixel templates. Create an original identity; do not reuse Cal AI logo, artwork, or proprietary assets. Explain uncertainty and let users replace image guesses with measured portions or a recipe. Avoid exact-looking numbers when uncertainty is broad.

Listing indicates in-app purchases and subscription-gated scanning; actual price varies by storefront/account. Store age rating is not evidence calorie restriction is safe for minors.

## Source
[Cal AI App Store listing](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616), accessed 2026-10-11.
