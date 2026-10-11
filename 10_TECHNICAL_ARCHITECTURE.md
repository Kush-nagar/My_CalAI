# Technical architecture and deployment decision
## Options
| Approach | Cost | Offline/privacy | Device access | Installation | Decision |
|---|---|---|---|---|---|
| Native Android+iOS | Free tools; iOS friction | Best | Best | Android APK direct; iOS free provisioning expires every 7 days | Strongest capability; duplicated work |
| Flutter local app | $0 tools | Strong | Good with platform bridges | APK easy; iOS needs macOS/Xcode and weekly free reprovision | Recommended candidate after device spike |
| PWA | Free only if secure origin available | Good manual workflows | Browser-limited camera/ML/health | Home-screen install; needs secure origin | Fallback for manual logging |
| React Native/Expo | Free local toolchain | Strong | Good; native modules may require dev build | iOS still requires Apple signing | Viable; check current cloud-build restrictions |
| Local AI server | No subscription if self-hosted | LAN only | Flexible compute | Computer must run/be reachable | Optional experiment, not core |

PWA install and offline depend on browser/service-worker support and HTTPS for ordinary installation ([MDN install](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [offline](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)). Android APK distribution requires user opt-in to installation source ([Android](https://developer.android.com/studio/publish)). Apple Personal Team profiles expire after seven days and need reinstallation ([Apple](https://developer.apple.com/help/account/basics/about-your-developer-account/)).

## Proposed structure
UI → domain functions (portion conversion, recipes, nutrient aggregation, search rank) → repository → SQLite, app-private images, licensed bundled seed. Optional adapters: OFF, USDA, Health Connect, HealthKit, local model. Adapters fail into manual flow. No backend/auth/account.
Use versioned migrations in transactions, stable IDs, and repository validation. Images live outside database with managed references. Store secrets with OS secure storage; avoid secrets when possible. Keep USDA key in local configuration, never source control. OFF uses descriptive User-Agent.

## Gate before framework choice
Identify device/build computer. Spike camera, barcode, SQLite, export/restore, and model runtime on actual hardware before committing. Pick Flutter if one UI and supported plugins work; choose native if reliable OS-specific ML/integration dominates. PWA only if manual diary suffices. No server is needed for P0.
