# Master implementation prompt for Claude Code
Read all numbered documents and ZERO_COST_DEPLOYMENT_GUIDE.md before implementation. Follow repository and platform instructions first. This is a future implementation handoff; current deliverable is documentation only.

## Objective
Build a polished, private, offline-first food journal for one person eating diverse Indian foods. Added operating cost must remain $0. After installation it runs independently of Claude Code, a development server, or an always-on computer.

## Principles
1. Manual/search logging is core; photo AI is optional.
2. Every nutrient has provenance and serving basis; missing is not zero.
3. Recipes use actual ingredient quantities and yield; regional variants stay distinct unless supported.
4. Estimates are editable and labeled; photo calories are never exact.
5. Local persistence and user-controlled backup; no account.
6. Age-appropriate educational defaults; minors get no restrictive goals or punitive mechanics.
7. Never copy Cal AI assets, marks, or source.

## Platform gate
Identify phone and build computer first. Compare native, Flutter, React Native/Expo and PWA against camera, barcode, SQLite, model, installation, iOS signing and cost. Prove a real-device vertical slice before committing. Android APK is practical; retain signing key. Free iOS Personal Team requires Mac/Xcode and expires every seven days. PWA needs secure origin and has browser limits.

## Order
Device feasibility → local foundation → diary/search → Indian records/recipes → barcode/data lookup → photo license/performance gate → optional health → safety/accessibility → personal installation. Do not lead with AI or cloud infrastructure.

## Privacy/data
Diary, image, inference, health import remain local. Optional user-triggered source queries send minimal query/barcode and are disableable. Never upload images. Historical nutrient snapshots immutable. Validate imports and stage restore. Never commit keys. Track license/provenance.

## Cost gate
Before adding library, service, API, model, dataset, build service, or hosting dependency, document current license/terms, purpose, full cost, data flow, offline mode, maintenance, alternatives. Any paid dependency or architecture change requires user review. Free trials/credits are not sustainable.

## Photo gate
Candidate suggestions require user correction and confirmation. If no lawful, Indian-appropriate model clears device latency/memory/storage and validation, ship without recognition. No fabricated confidence or Cal AI benchmark.

## Reporting
Use acceptance/test plans in docs 04, 11, 14, 15. Report evidence, platform, cost/license audit, known uncertainty, backup/migration behavior, and material unresolved gaps. Never claim unverified tests, performance, licenses, or coverage.
