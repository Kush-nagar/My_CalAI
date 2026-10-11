# Claude Code implementation handoff
## Mission
Implement the personal, local-first nutrition journal from this package only when the user separately begins implementation. This current phase is research, not application code.

## Read first
01 overview; 04 product requirements; 10 architecture; 11 database; 12 security; 14 roadmap; 15 testing; zero-cost deployment guide.

## Hard constraints
One personal owner; $0 added cost; no app-store membership, paid APIs/credits, hosted database, paid storage, subscription, analytics, cloud inference, or mandatory account. Do not assume Claude Pro/ChatGPT Plus provides runtime API access. Core log/history/recipe/backup works offline. No upload of photos/diary. No Cal AI assets or branding.

## Required behavior
Prioritize search/manual, regional aliases, recipes from ingredient weights, source provenance, robust units, recents, backup/restore, user correction. Photo is only a suggestion and cannot save before confirmation. No “exact” claim. For under 18 disable calorie goals, weight-loss prescriptions, punitive scoring, body comparison, and exercise-to-earn-food. Keep activity separate from consumption.

## Stop gates
Before adding any cost, account, external network, license obligation, model/data redistribution obligation, or deployment model change, present purpose, exact terms/license, current price, data flow, offline limits and alternatives for user review. IFCT extraction rights and every model/dataset license are unresolved gates; never bundle unknown data/assets.

## Architecture and done
Use local cohesive repository/domain patterns, no speculative services. Snapshots immutable; migrations transactional; imports validated; restores staged. Unit/integration/device tests cover math, migrations, backup, offline and accessibility. Done means installed app launches without server; offline core works; backup round trip; cost/license audit; egress reviewed; actual device/platform recorded; unresolved accuracy gaps disclosed. No mock prediction presented as functionality.
