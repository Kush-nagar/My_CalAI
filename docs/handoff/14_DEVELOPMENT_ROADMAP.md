# Development roadmap
Research handoff only; no application has been implemented.

## Stage 0 — Device/build feasibility
Record phone OS/version, RAM/storage, computer and Mac availability. Spike camera, database, scanner, export. Done: device matrix and install proven without hidden paid service.
## Stage 1 — Foundation
Design tokens, navigation, SQLite, migrations, date/time, app-private image storage, settings. Done: offline launch and interrupted migration recovery.
## Stage 2 — Reliable logging
Search, custom foods, units, diary, edit/delete, recents, snapshot nutrient, export. Done: deterministic totals and missing-value distinction.
## Stage 3 — Indian food and recipe engine
Add license-cleared records/aliases, recipe ingredients, state, yield, conversions. Done: regional coverage report and no unverified IFCT bulk import.
## Stage 4 — Barcode/data lookups
Scanner and OFF; optional USDA with local key. Done: no-match fallback, validation, attribution, cache/opt-out; offline remains fully usable.
## Stage 5 — Photo model gate
Audit model/weights/data licenses; build held-out weighed Indian set; benchmark target phone. Done: class metrics, latency/RAM/storage/battery, calibration and failures. If not cleared, do not ship.
## Stage 6 — Health/trends
Optional HealthKit/Health Connect; activity separate from intake; neutral trends. Done: revocable permissions and deduplicated imports.
## Stage 7 — Safety/accessibility/reliability
Minor-safe mode, hide calories, screen reader, dynamic type, contrast, offline, backup/restore, low-storage/corruption. Done: P0 acceptance on device.
## Stage 8 — Personal install/maintenance
Retain signing key; document APK updates; explain weekly iOS free reprovision. Done: app runs without computer/server and restored backup validated.

Planned tests: arithmetic/units/migrations, local transactions, offline fallback, scanner/camera, archive restore, accessibility, physical-device performance. Mocks are not completed features.
