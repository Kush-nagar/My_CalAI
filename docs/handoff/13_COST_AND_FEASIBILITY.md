# Cost and feasibility audit
**Target:** one user, one phone, no additional spend. Free means no required purchase today, not no maintenance or future policy change.

| Dependency | Purpose/license | Added cost | Offline | Limitation |
|---|---|---:|---|---|
| Flutter SDK | BSD-3-Clause; audit plugins | $0 | Yes | Plugin compatibility |
| SQLite | Public domain | $0 | Yes | Migrations/backups are app responsibility |
| Camera/barcode plugin | Verify exact license | $0 | Yes | Device behavior varies |
| MediaPipe/Core ML | Verify version license | $0 | Yes | Runtime does not supply Indian food model |
| Model + datasets | Not cleared | $0 only if lawful free redistribution | Once bundled | Size/RAM/latency/accuracy unknown |
| IFCT 2017 | Public PDF, bulk reuse rights unresolved | $0 access | If permitted locally | Mostly raw items, not exhaustive dishes |
| USDA FDC | CC0/public domain | $0; key required | Cache/local seed | Default 1,000 calls/hour/IP |
| Open Food Facts | ODbL/data contents/image licenses separate | $0 API within terms | Selected cache | Crowd quality, share-alike obligations |
| HealthKit/Health Connect | Platform APIs/terms | $0 | Mostly local | Permission/platform bridges |
| Android Studio/Xcode | Free tools; Xcode requires Mac | $0 | Yes | iOS Mac requirement |
| Android APK | Own signing key | $0 | Yes | User opts into install source; retain key |
| Apple Personal Team | Free provisioning | $0 | Yes after install | Seven-day expiry/reinstall |
| PWA host | Secure origin | May be free, not guaranteed | Partial | No free host assumed |
| EAS/cloud build | Convenience | Not required | No | Plans/limits change |

Claude Pro/ChatGPT Plus are not programmable API credits. No promotional credits or free API tier may be a runtime dependency.

## Feasibility gaps
Comparable cloud-photo recognition not proven on target handset. Indian cooked-food coverage needs lawful structured data work; IFCT alone is not a ready app catalog. iOS requires Mac and recurring free reprovision. No model+dataset pair is cleared for production.

## No-go
Reject anything requiring recurring payment, credit card, external runtime token, cloud inference, or network for core logging. If no model clears accuracy/license/performance gates, ship manual, recipe, and barcode workflows without photo recognition.
