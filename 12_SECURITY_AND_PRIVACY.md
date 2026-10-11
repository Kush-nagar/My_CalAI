# Security, privacy, and local storage
Food diary, meal photos, weight/activity, and inferred patterns are sensitive health-adjacent data. Defaults: no account, telemetry, ads, cloud sync, image upload, or crash logs containing user content. App sandbox does not protect unlocked/compromised devices or exported unencrypted backups.

## Controls
Request camera/photo access at point of use; prefer OS picker. Health access is optional and scoped; explain read/write and allow revocation. Keep database/images/model files app-private; avoid shared gallery. Separate controls for photo retention, calorie visibility, health, network lookup, and export. Never log images, food names, health values, API keys, or backup contents. No third-party analytics/crash SDK in first release.

## Network
Optional OFF/USDA queries disclose query/barcode, IP and request metadata. Make them user initiated; send minimal data; identify source; allow disabling. Never send meal images. USDA keys should not be shipped in source. Core diary works offline.

## Backups and threats
Backup leaves app sandbox. Prefer passphrase-encrypted archive with maintained library, authenticated encryption, and standard password KDF; never custom cryptography or hardcoded key. If safe encryption unavailable, offer unencrypted export only with plain warning and user-selected destination. Restore defends path traversal, symlinks, oversized archives, malformed records, duplicate IDs, and corruption; stage and validate before atomic commit. Delete-all includes orphan images.

| Risk | Control |
|---|---|
| Backup exposed in shared folder | Encryption, destination choice, warning |
| Model/data license restrictive | Do not bundle before full audit |
| OFF ODbL obligations | Keep lineage, attribution; legal review before redistributing derived dataset |
| API key leaked | Local config; never commit/share |
| Teen harm/medical claim | Safe defaults and educational-only language |
| Permission overreach | Least privilege and visible settings |
| Corruption/data loss | Transactions, checksums, pre-restore snapshot |

This is a personal-use handoff, not legal advice; current platform and source terms must be reviewed before distribution.
