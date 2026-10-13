# Thali privacy and safety audit

Audit date: 2026-10-11. Scope: the integrated code in this repository (UI, storage, backup,
service worker, barcode scanner, Open Food Facts adapter), re-checked by an independent review
after integration. Re-run the checks in
"How to re-check" before every release.

## In one paragraph

Thali keeps your food journal on your device only. There is no account, no server, no analytics and
no crash reporting. The app makes one kind of network request of its own: when you turn on online
lookup and press a button to look up a barcode, it sends that barcode to Open Food Facts. Everything
else it loads is its own files from the site that hosts it. Your data leaves the device only as a
backup file that you choose to save or share. A backup can be locked with a passphrase.

## 1. What is stored, and where

| Data | Where | Notes |
|---|---|---|
| Diary entries (date, meal, food name, amount, nutrient snapshot, optional note) | IndexedDB `thali-ledger`, store `entries` | Sensitive: shows eating patterns. |
| Meal photos | IndexedDB, store `images` (Blob + type + time) | Only if you attach one. "Keep photos" setting; delete-all-photos available. Deleting an entry deletes its photo. |
| Custom foods, cached barcode results | IndexedDB, store `foods` | Barcode results keep their source and licence. |
| Recipes | IndexedDB, store `recipes` | |
| Settings (age band, calorie visibility, online lookup on/off, photo retention, theme, last backup time) and favourites | IndexedDB, store `kv` | The age band is personal information. |
| App files (code, built-in food list) | Cache Storage `thali-<version>` (service worker) | No personal data. |
| "Persistence already requested" flag | `localStorage` `thali.persistRequested`  | One flag, no personal data. |
| Backup files | Wherever you save them (Files, iCloud Drive, Downloads, a share target) | Leave the app's protection. See section 5. |

Nothing in IndexedDB is encrypted by the app itself. It is protected by the browser's per-site
isolation and by your device's own encryption and passcode.

## 2. Network traffic (egress inventory)

| Request | When | What it sends | Allowed by CSP |
|---|---|---|---|
| App files (`index.html`, JS, CSS, icons, manifest, built-in food list) from the host | Opening/updating the app | Normal web request: IP address, browser user agent, time. No personal data. | `default-src 'self'` |
| Service worker fetches | Install/update, offline fallback | Same-origin app files only. It never touches other sites (checked in `sw-template.js`). | same origin |
| Open Food Facts barcode lookup `https://world.openfoodfacts.org/api/v2/product/<barcode>.json` | Only when online lookup is on **and** you press the lookup button | The barcode number. OFF also sees your IP address and time. No cookies (`credentials: 'omit'`), no referrer. | `connect-src … https://world.openfoodfacts.org` |
| Web Share / download of a backup | Only when you press "Save to Files / Share" or "Download" | The file goes to the destination you pick in the system sheet. The app itself sends nothing. | not a network request by the app |
| Source links (e.g. a USDA page) | Only if you tap such a link | Opens the other site in the browser. | navigation, not covered by `connect-src` |

**Not present:** analytics, crash reporting, ads, fonts or scripts from CDNs, remote images,
WebSockets, `sendBeacon`, `EventSource`, `XMLHttpRequest`, photo upload.

### How this was checked

```
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|new Image\(|https?://" src index.html
```

Findings on 2026-10-11:
- App code: no network calls except the Open Food Facts lookup below. Also `navigator.share` in `src/ui/backup/BackupPanel.tsx`
  (user-triggered share sheet) and a dynamic `import()` of the bundled food list (same origin).
- `src/platform/off.ts`: one `fetch` to the Open Food Facts URL above. It checks the
  barcode is 8–14 digits, uses an 8-second timeout, `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`.
  The barcode sheet calls it only after the user presses "Look up on Open Food Facts", and that
  button only appears when `settings.onlineLookup` is on (default off). Verified after integration.
- `src/platform/sw-template.js`: `fetch` of same-origin requests only; cross-origin
  requests are ignored.
- `scripts/data/fetch-usda.mjs` downloads USDA data at **build time** (GitHub Actions). It is not shipped to the app.
- `package.json` contains GitHub URLs as metadata only.

## 3. Content Security Policy (`index.html`)

```
default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:;
style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval';
connect-src 'self' https://world.openfoodfacts.org; worker-src 'self'; manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'none'
```
plus `<meta name="referrer" content="no-referrer">`.

Review:
- Good: scripts only from the app's own origin, no inline scripts, no `eval`. Network requests
  only to self and Open Food Facts. No remote images, so OFF product photos cannot load.
  No plugins, no form posts, no `<base>` hijacking.
- `'wasm-unsafe-eval'` is needed for the barcode decoder (WebAssembly). It does not allow JS `eval`.
- `style-src 'unsafe-inline'` allows inline styles (Preact `style=` attributes). Low risk. Remove it
  if the UI stops using inline styles.
- `img-src data:` is not needed by the backup code (restored photos use `blob:`). Remove it if no
  other code needs it.
- Limit: a `<meta>` CSP cannot set `frame-ancestors`, so another site could embed the app in a
  frame. The data stays in Thali's own origin, but clickjacking is possible in theory. A host that
  supports response headers can add `Content-Security-Policy: frame-ancestors 'none'`. GitHub Pages cannot.
- The CSP also limits what a malicious backup file could do: even if text got into the page, it
  could not load scripts or send data anywhere except Open Food Facts.

## 4. Backup and restore design

- **Format:** one JSON file (`thali-backup-YYYY-MM-DD.json`) with format version, data version,
  app version, creation time, a manifest with record counts and a SHA-256 checksum for each section,
  and photos as base64 with their own SHA-256 checksums.
- **Encryption (recommended, on by default in the UI):** WebCrypto only. PBKDF2-SHA-256 with
  600,000 iterations and a random 16-byte salt derives the key. AES-256-GCM (authenticated) with a
  random 12-byte IV encrypts. The header is bound to the ciphertext, so any change is detected.
  No custom cryptography; no key is stored anywhere. A forgotten passphrase cannot be recovered.
- **Unencrypted export** is allowed. It shows a plain warning that anyone with the file can read the
  diary and see the photos.
- **Restore is staged.** The file is fully checked in memory first, and the database is not touched.
  Checks: size limit (200 MB), file format and version, data version newer than the app, checksums,
  record shapes, number ranges and text lengths, id format, duplicate ids, photo types (JPEG, PNG,
  WebP, HEIC/HEIF only, and the bytes must match the type), base64 validity, forbidden keys
  (`__proto__`, `constructor`, `prototype`), nesting depth, and passphrase. Links in food sources
  must be `http(s)` (no `javascript:`).
- **Replace** first makes a full safety copy of the current data, which you can save. It then clears
  and rewrites everything in **one** database transaction. If anything fails, the transaction is
  rolled back and the current data stays as it was (this is tested). If the restored backup was
  encrypted, the safety copy uses the same passphrase.
- **Merge** only adds records whose ids are not already on the device. It never overwrites existing
  records or settings. Favourites are combined.
- Backups contain settings and favourites from `kv`. Other `kv` keys, if added later, are not
  included and are left alone by restore.

## 5. Threats

| Threat | What happens | What protects you | What is left |
|---|---|---|---|
| A backup file ends up in a shared folder, chat, or someone else's hands | Unencrypted: anyone can read the diary and photos. Encrypted: they see only the file size. | Passphrase encryption (on by default), plain warning when it is off, you choose where the file goes | A weak passphrase can be guessed offline. Use four or more random words. |
| Lost or stolen phone | Whoever unlocks it can open the app and read everything | Your phone's passcode and device encryption | Thali has no separate app lock. |
| Safari clears website data, or the Home Screen app is deleted | The journal is erased | Backups. The app explains this and asks the browser to keep data (`navigator.storage.persist`) | On iPhone, if Thali is not on the Home Screen, Safari may delete its data after about 7 days without use. iCloud does not back it up. |
| Malicious or damaged backup file | Could try to crash the app, inject odd data, or overwrite your journal | Staged validation (section 4), size and length caps, allow-listed photo types with signature checks, atomic commit, safety copy before replace, CSP | A valid but unwanted backup can still replace your data if you confirm Replace. The safety copy is the undo. |
| Open Food Facts sees your lookups | OFF learns the barcode, your IP address and the time | Off by default, one button press per lookup, only the barcode is sent, no cookies or referrer | Your IP address is visible to OFF. |
| The hosting site serves altered code (compromised account or host) | Altered code could read and send your data | CSP in the page limits it, but altered code could change the CSP too | You trust the host and the repository. Use 2FA on the GitHub account. |
| Someone else uses the same browser profile on a shared computer | They can open Thali and see the journal | Nothing in the app | Use your own OS account or profile. |
| Browser extensions (desktop) | Extensions with site access can read the page | None in the app | Limit extensions on the browser you use for Thali. |

## 6. Safety for under-18 users

Rules from `CLAUDE.md` that the UI must follow, plus what the backup feature adds:
- Under-18 mode: no calorie targets, no deficit or weight-loss messages, no streaks, scores, body
  comparisons, or "exercise to earn food". Calories are hidden by default. Education is neutral.
- Backups: no notifications and no nagging. Only a gentle line appears when the last backup is more
  than 7 days old or none exists. The copy talks about keeping the journal safe, never about eating
  or weight.
- Restore shows a note when a backup's age setting differs from the device's (for example, an
  "adult" backup restored onto an "under 18" device) before you replace.
- The age band is stored only on the device and in backups you make.

The UI worker's screens were not part of this audit. Check them against these rules when they are merged.

## 7. What is NOT protected

- Data in IndexedDB is not encrypted by the app. It relies on the device passcode and encryption,
  and on the browser keeping sites separate.
- Unencrypted backups, and anything you do with a backup after saving it (cloud folders, email, chat).
- Encrypted backups with a weak passphrase. PBKDF2 slows guessing but cannot save a short password.
- A forgotten passphrase. The backup is then unreadable, by design.
- Data loss from browser storage eviction or app deletion when there is no recent backup.
- Your IP address during app loads (seen by the host) and barcode lookups (seen by Open Food Facts).
- Anyone who can unlock your device, use your browser profile, or install extensions in it.
- Altered code served by a compromised host or repository.
- File size and approximate content volume of an encrypted backup (the size is visible).

## How to re-check

1. Run the grep in section 2 and compare the results with the egress table.
2. Confirm `connect-src` in `index.html` still lists only `'self'` and `https://world.openfoodfacts.org`.
3. `npm test` covers the backup round trip, encryption, wrong passphrase, tampering, duplicate ids,
   newer schema, oversized and invalid files, prototype-pollution keys, merge without overwrite,
   and rollback on failure (`src/backup/backup.test.ts`).
4. In the browser's devtools Network tab, use the app offline and online with lookup off: there
   should be no requests except app files.

## Water and daily references
Water drinks (amount and time) are stored in IndexedDB `kv` under `water`; daily references are part of
the settings. Both stay on the device and are included in backups. Under-18 mode stores no calorie or
macro references.

## Photo suggestions (optional)
- Off by default. Nothing model-related is downloaded until you choose "Set up photo suggestions" and confirm the size.
- The model (≈63 MB) and runtime (≈27 MB) download from Thali's own website into Cache Storage
  (`model-cache:*`). They contain no personal data.
- Suggestions run in a Web Worker on your device, reading only those cached files. The photo and diary are
  never sent anywhere; the worker makes no network requests. This is enforced by the CSP and checked by
  `tests/e2e/photo-suggest.spec.ts`.
- Remove it in Settings. If iOS clears website data, the app shows that the model is gone and keeps working
  without it.
- Backups contain the `photoSuggestions` on/off setting only, not the model files.

## Photos
Attached photos are always re-encoded as a downscaled JPEG before storage, which strips EXIF metadata
such as GPS location. Photos the browser cannot decode are not stored. Unreferenced photos are deleted
at app start.
