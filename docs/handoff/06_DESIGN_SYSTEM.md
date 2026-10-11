# Original design system
Proposed tokens, not reverse-engineered Cal AI specifications.

## Tokens
Light: canvas #F7F5EF; surface #FFFFFF; ink #222620; secondary #5F665E; forest #315A45; turmeric #D59432; border #E4E1D8; success #356B50; caution #8C5B16; error #A13D36.
Dark: canvas #171B18; surface #222823; ink #F1F1E8; secondary #BAC1B8; forest #A8C7AE; turmeric #E6B45E; border #39423B; success #A8C7AE; caution #F0C578; error #F1A49D.
Verify contrast; never encode meaning by color alone.

Typography: platform system sans (SF/Roboto); display 28/34 semibold; title 22/28 semibold; heading 18/24 semibold; body 16/24; secondary 14/20; caption 12/16. Numeric nutrients use tabular figures. Respect system scaling and locale digits.
Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48 dp/pt.
Radii: 8 controls, 12 cards, 16 sheets; pill only for compact tags. 1px borders; restrained shadows.
Motion: 120–220 ms; honor reduced motion.

## Components
- Food row: name, portion, optional kcal, source marker, edit/delete.
- Nutrient bar: value and denominator; no implied “remaining” goal by default.
- Candidate panel: possible matches, ambiguity, adjustable amount; numeric confidence only after calibration.
- Source chip: analytical table, package label, user recipe, photo estimate, user-entered; opens provenance.
- Offline badge: concise, neutral, non-blocking.
- Buttons: filled primary, outlined secondary, destructive text with confirmation where data is lost.
- Inputs: persistent labels, unit selector, inline validation.
- Charts: direct labels, full context, text equivalent.
- Photo preview: local-only notice, retake/crop/delete controls.

## Content guidance
Use “estimated from photo” or “calculated from ingredient weights.” Avoid “exact,” “bad food,” “cheat,” or “burned off.” If numeric uncertainty is unvalidated, do not invent a confidence percentage. Precision shown should match input quality.
