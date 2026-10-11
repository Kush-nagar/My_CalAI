# Thali — private offline-first Indian food journal (PWA)

Personal-use app built from the research handoff in `docs/handoff/` (read `00_README.md`,
`MASTER_IMPLEMENTATION_PROMPT.md`, `ZERO_COST_DEPLOYMENT_GUIDE.md` first). Owner uses an iPhone
and a Windows PC, no Mac, so the target is an installable static PWA on a free HTTPS host.

## Required skills (every session and every subagent)
The owner requires the **Caveman** and **Ponytail** skills for all work, and **Impeccable** plus the
installed taste/UI skill (`design-taste-frontend` / `taste-ui`) for all frontend design work.
- At session start, look for them in `.claude/skills/`, `~/.claude/skills/`, installed plugins,
  and `SearchSkills`/`SearchPlugins`. Load and follow them when present.
- Subagents: include the loaded skill instructions in the task prompt (or configure them in
  the agent definition). Naming a skill is not loading it.
- If a skill is missing, say so in the report. Never invent its instructions or claim it was used.
- Status as of 2026-10-11 (cloud session): none of the four were installed. "Caveman" plugins
  exist in the Anthropic plugin directory but were not enabled; Ponytail, Impeccable and a taste UI
  skill were not found. An official `frontend-design` plugin exists but was not enabled.

## Hard rules (from the handoff; do not relax)
- $0 added cost. No accounts, cloud DB, analytics, crash SDKs, paid APIs, trials or credits.
- Diary, recipes, photos and settings live in IndexedDB on the device. Never upload photos or diary.
- The only network call allowed at runtime is the opt-in, user-triggered Open Food Facts barcode
  lookup (sends only the barcode). CSP in `index.html` enforces this; keep it tight.
- Missing nutrient = `null` with reason, never 0. Totals with unknown parts are flagged incomplete.
- Diary entries store immutable nutrient snapshots (`MealEntry.per100g` + `nutrients`).
- Household measures only with evidence (`ServingConversion.evidence`); otherwise grams.
- Do not bundle IFCT-derived data or any data/model/asset without a recorded license (docs/LICENSES.md).
- No photo recognition is shipped: no lawful, validated Indian-food model cleared the gate. Never
  simulate recognition or invent confidence values.
- Under-18 mode: no calorie targets, deficit/weight-loss messaging, streaks, scores, body
  comparison or exercise-to-earn-food; calories hidden by default; neutral education only.
- No Cal AI branding, names, graphics or layouts.

## Architecture
- `src/domain/` pure logic + types (`types.ts` is the shared contract). Unit-tested.
- `src/db/` IndexedDB via `idb`; versioned migrations in `db.ts`; `repo.ts` is the only persistence API.
- `src/data/` bundled license-cleared seed catalog (`seed/foods.json`) built by `scripts/data/`.
- `src/backup/` export/validate/restore (staged, checksummed, optional AES-GCM passphrase encryption).
- `src/platform/` service worker registration, storage persistence, barcode, OFF adapter.
- `src/ui/` Preact screens; `store.ts` provides app context.
- Static build: `npm run build` → `dist/` (relative base, works under any path).

## Commands
`npm test` (vitest) · `npm run typecheck` · `npm run build` · `npm run test:e2e` (Playwright,
Chromium at /opt/pw-browsers; WebKit not available in the cloud container).
