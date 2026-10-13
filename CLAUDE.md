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
- Status as of 2026-10-11 (two cloud sessions, re-checked): none of the four were installed. "Caveman" plugins
  exist in the Anthropic plugin directory but were not enabled; Ponytail, Impeccable and a taste UI
  skill were not found. An official `frontend-design` plugin exists but was not enabled.

## Hard rules (from the handoff; do not relax)
- $0 added cost. No accounts, cloud DB, analytics, crash SDKs, paid APIs, trials or credits.
- Diary, recipes, photos and settings live in IndexedDB on the device. Never upload photos or diary.
- The only third-party network call allowed at runtime is the opt-in, user-triggered Open Food Facts
  barcode lookup (sends only the barcode). The opt-in model download is same-origin. CSP in
  `index.html` enforces this; keep it tight.
- Missing nutrient = `null` with reason, never 0. Totals with unknown parts are flagged incomplete.
- Diary entries store immutable nutrient snapshots (`MealEntry.per100g` + `nutrients`).
- Household measures only with evidence (`ServingConversion.evidence`); otherwise grams.
- Do not bundle IFCT-derived data or any data/model/asset without a recorded license (docs/LICENSES.md).
- Photo suggestions (docs/PHOTO_SUGGESTIONS.md) are optional and off by default: SigLIP2 image encoder
  (Apache-2.0) runs on-device in a worker; model files download only after explicit opt-in, from the
  app's own origin (`models/`, `ort/`), into Cache Storage `model-cache:*` (never `thali-*`, never
  precached). Suggestions are our own labels only; never show scores/confidence, never prefill amounts,
  never estimate calories/portions/oil, never save without the user confirming each food. Not yet
  verified on a real iPhone — do not claim it works there until it has been.
- Under-18 mode: no calorie targets, deficit/weight-loss messaging, streaks, scores, body
  comparison or exercise-to-earn-food; calories hidden by default; neutral education only.
- No Cal AI branding, names, graphics or layouts.

## Architecture
- `src/domain/` pure logic + types (`types.ts` is the shared contract). Unit-tested.
- `src/db/` IndexedDB via `idb`; versioned migrations in `db.ts`; `repo.ts` is the only persistence API.
- `src/data/` bundled license-cleared seed catalog (`seed/foods.json`) built by `scripts/data/`.
- `src/backup/` export/validate/restore (staged, checksummed, optional AES-GCM passphrase encryption).
- `src/platform/` service worker registration, storage persistence, barcode, OFF adapter.
- `src/vision/` optional on-device photo suggestions: download manager, worker (ORT), scoring, matching.
- `src/ui/` Preact screens; `store.ts` provides app context; `src/ui/vision/` model state + review UI.
- Static build: `npm run build` → `dist/` (relative base, works under any path).

## Commands
`npm test` (vitest) · `npm run typecheck` · `npm run build` · `npm run test:e2e` (Playwright,
Chromium at /opt/pw-browsers; WebKit not available in the cloud container) · `npm run test:vision`
(browser embedding parity vs CI reference). Vision assets are rebuilt by the "Vision assets"
GitHub Actions job (`scripts/vision/`), because huggingface.co is blocked in the dev container.
