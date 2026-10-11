# Testing and quality plan
No test results are claimed; this is the protocol Claude Code should execute.

## Nutrition correctness
Table-driven fixtures for nutrient scaling, units, serving conversion, recipe yield, null propagation, rounding, timezone boundaries, immutable snapshots. Missing nutrients must never become zero; partial recipe totals are flagged.

## Model and portion
Reference set uses weighed ingredients, cooked yield, leftovers, multiple Indian regions, mixed dishes, packages, restaurants, lighting, utensils and language hints. Split by recipe/session to prevent leakage. Report per-class top-1/top-5; multi-label precision/recall/F1; grams MAE/relative error; calorie/macros MAE/MAPE/signed bias; correction/abstention; latency, RAM, storage, battery. Separate food identity, portion, nutrient matching, total meal. Include confidence intervals and failure examples. Compare photo-only/hint/measured portion.

## Device targets (proposed, not measured)
Cold start usable Today ≤2.5s median; camera open ≤1s after granted permission; local search ≤150ms p95 at 10k records; meal save ≤250ms p95. Model target median ≤3s only as device gate; report peak RAM/storage, otherwise disable. Measure battery on repeated inference and ordinary 30-minute use. Record phone/OS/build/thermal state. No Cal AI benchmark is available; do not claim parity.

## Resilience/security
Exercise airplane mode, denied/revoked permissions, interrupted save, full storage, app termination, bad barcode response, expired API key, malformed/oversized archive, path traversal, checksum mismatch, wrong password, duplicate health import, migration failure. Restore never overwrites current data before validation.

## UX/accessibility
Task observation with VoiceOver/TalkBack, large text, themes, handedness, long regional names, reduced motion and empty states. Measure success/correction time. No testing copy should encourage restriction or weight loss.

## Release gate
P0 offline flows pass; backup round-trip demonstrated; no image egress; dependency/license ledger complete; unresolved model/data license blocks distribution; high-severity data-loss/security defects fixed; device matrix recorded.
