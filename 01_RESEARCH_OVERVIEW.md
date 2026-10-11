# Research overview and decision record
**Checked:** 11 October 2026. **Scope:** personal use, one owner/device, $0 additional cost, local-first, no application code.

## Executive recommendation
Build a private, offline-first nutrition journal. Dependable core: manual/search logging, reusable meals, measured serving entry, source-backed nutrients, corrections, and local backup. Barcode lookup and photo suggestions are optional convenience layers. Never equate recognition with portion measurement or nutrition analysis. A photo cannot reveal hidden oil, recipe ratios, ingredients under sauce, or edible mass; estimates remain uncertain and user-reviewed.

Recommended direction: a local mobile app with SQLite, app-private image storage, migrations, and explicit backup/restore. Flutter is a plausible shared UI, subject to verifying camera/model plugin compatibility on the actual phone. Keep health integrations optional and user-triggered. No server, account, analytics, paid API, or cloud DB. Android can install a signed APK; free iOS Personal Team provisioning expires every seven days, requiring rebuild/reinstall ([Apple limits](https://developer.apple.com/help/account/basics/about-your-developer-account/)). A PWA avoids signing but needs a secure origin for normal install and has browser capability limits.

## Evidence rules
**Verified** means official listing/docs or peer-reviewed paper; **inference** means an architectural conclusion; **unknown** means private implementation, exact model, or internal performance. Features/prices can vary by country, account, and release. Accessed 2026-10-11 unless dated.

## Decision
Chosen: offline manual nutrition ledger first; photo suggestions only with confirmation; local persistence and backup; generic raw ingredients plus custom recipe calculator.
Deferred: calorie targets, cloud sync, hosted inference, social features, public release, calorie-burn subtraction.
Rejected as promises: exact photo calories, universal Indian recipe coverage, free iOS permanent sideloading.
Next gate: identify target device and run a weighed Indian-meal pilot before selecting/bundling any classifier.

## Research gaps
1. Phone make/model, OS, free storage, RAM, preferred install route.
2. Compatible Indian-cuisine model/dataset with redistribution rights.
3. IFCT bulk extraction/redistribution rights; public PDF availability alone is not a permissive data license.
4. Mac/Xcode access for iOS.
5. Whether HealthKit/Health Connect benefits justify separate native bridges.
See [sources index](RESEARCH_SOURCES.md).
