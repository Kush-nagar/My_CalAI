# Install Thali on your iPhone

Thali is a web app you install from Safari. No App Store, no account, no cost. (Needs iOS 16 or newer.)

## Install
1. Open the Thali address in **Safari** (not Chrome or another browser; only Safari can install web apps on iPhone).
2. Wait until the page has fully loaded once, online.
3. Tap the **Share** button (square with an arrow), scroll down, tap **Add to Home Screen**, then **Add**.
4. Close Safari. From now on open Thali from the **Home Screen icon**.

## Check that it works offline
1. Open Thali from the Home Screen once while online.
2. Turn on **Airplane mode**.
3. Close Thali (swipe up) and open it again from the icon. It should open and let you log food.
4. Turn Airplane mode off when done.

## Where your data lives (read this)
- Everything is stored **on this phone**, inside the app. Nothing is uploaded.
- The Home Screen app and Safari have **separate storage**. Use the Home Screen icon only; data you entered in a Safari
  tab will not appear in the installed app.
- **Deleting the icon deletes the data.** Export a backup first.
- If you only use it as a Safari tab (not installed), iOS may erase website data after about 7 days without use.
  Installing to the Home Screen avoids this, but backups are still your safety net.
- Make a backup regularly: Settings, then export. Save the file to **Files**, preferably to **iCloud Drive**, so it survives
  losing or resetting the phone. Restore from the same screen.

## Barcode scanning
- Tap the barcode option when logging. Thali asks for **camera permission** only at that moment and explains why. The
  camera image never leaves the phone.
- If you tapped Don't Allow: iPhone **Settings, Apps, Safari, Camera** (or Settings, Thali if listed) and allow it, or just
  type the barcode number.
- Packaged-food **lookup on Open Food Facts** is off by default. If you turn it on in Settings, it only sends the barcode
  number, and only when you press the lookup button. The community-contributed data can be wrong; check it against the label.

## Photo suggestions (optional, experimental)
Off by default. In Settings › Photo suggestions you can download a ≈90 MB model once (Wi-Fi
recommended). After that, Thali can suggest possible food names from a photo **on your phone, even in
Airplane mode**. You always pick the food and the amount. The model has not yet been tested on a real
iPhone, so please run the short checklist in `docs/PHOTO_SUGGESTIONS.md` and report what you see. If iOS
clears website data the model may disappear; the app tells you and keeps working without it.

## Updating
Open Thali while online. When a new version has downloaded, a bar at the bottom says **Update available — reload**.
Tap Reload. Your data is not touched by updates. If you never see the bar, close the app fully and reopen it while online.

## Why not a "real" iPhone app?
- Building a native app needs a **Mac with Xcode**. You have no Mac.
- A free Apple "Personal Team" account can only install apps you built yourself, and each install **expires after 7 days**
  and must be rebuilt on the Mac.
- The paid Apple Developer Program (about US$99 per year) is **not used** here, and the App Store is not used.

A web app installed to the Home Screen avoids all of that. Limits: iOS can restrict background features and storage
for web apps more than for native apps, which is why backups matter.
