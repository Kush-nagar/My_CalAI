# Zero-cost personal deployment guide
Constraints checked 11 October 2026; platform policies may change.

## Android
Build a signed APK locally using Android Studio/Gradle or the selected framework's local toolchain. Transfer by cable or trusted local method. Modern Android asks the user to allow installs from the chosen source ([official guide](https://developer.android.com/studio/publish)). Retain the signing key and password securely; updates require the same signing identity/package. Install and check offline launch, permissions, backup. Android developer verification rollout is changing: official docs state September 30, 2026 enforcement in Brazil, Indonesia, Singapore and Thailand and broader rollout planned for 2027; check whether user's region/personal limited distribution is affected before installing/updating ([verification](https://developer.android.com/developer-verification/guides)).

## iPhone
Requires Mac and Xcode. Sign in with Apple Account under Personal Team, connect iPhone, trust device, build/install. Apple states Personal Team profiles expire after 7 days, with limits on IDs/devices/apps, so rebuild/reinstall periodically ([Apple account guide](https://developer.apple.com/help/account/basics/about-your-developer-account/)). No dependable permanent free native route is assumed. If weekly maintenance is unacceptable, use PWA or revise $0 condition later.

## PWA fallback
Home-screen PWAs can cache app resources with service workers, but normal installation needs a secure origin such as HTTPS and browser capabilities differ ([installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_Installable), [offline](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)). Do not assume a free host/domain. Development-computer localhost is not phone-independent.

## Install/update checklist
1. Build release artifact locally; record app version, source revision, device/OS and licenses.
2. Sign artifact; checksum; keep signing credentials in safe offline storage.
3. Transfer locally; avoid public links with personal data.
4. Install; test cold launch and meal logging in airplane mode.
5. Before update export backup; install with same signing identity; verify history and restore.
6. Keep two user-controlled backups, one offline; encrypt where supported.
7. Before uninstall export; remove separately exported files if desired.

Core diary should not need network. Optional lookup needs connectivity and can be disabled. Model updates are manual and license-checked. No computer needs to remain running after installation. A home AI server is not core because it must run and be reachable.

## Cost ledger
No app store membership, domain, server, inference API, paid database/storage, or credit-backed trial. Existing hardware/connectivity/subscriptions are excluded from incremental cost. Recheck toolchain, model and dataset terms at build time.
