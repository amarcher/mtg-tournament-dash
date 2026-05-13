# Native iOS / Android wrap (Capacitor)

This repo ships a Capacitor configuration that wraps the production web app
(`https://mtg.capxun.com`) as a native iOS + Android binary. The wrap is
intentionally minimal: a `WKWebView` (iOS) / `WebView` (Android) pointing at
the live URL. No bundled JS, no offline mode, no client-side state
duplication. Everything that works in mobile Safari / Chrome on
`mtg.capxun.com` works in the app — and any deploy to Vercel is instantly
live in the app, no resubmission required.

**Status:** groundwork only. The Capacitor config + npm scripts are in
place. Native projects (`ios/`, `android/`) are *not* scaffolded yet — you
generate those when you're ready to start the App Store path. See "First
scaffold" below.

## What's already in the repo

- `capacitor.config.ts` — app id `com.capxun.mtgdash`, name "MTG Dash",
  `server.url` pointing at the prod web URL.
- `@capacitor/core`, `@capacitor/ios`, `@capacitor/android` in dependencies.
- `@capacitor/cli` in devDependencies.
- npm scripts: `cap:add:ios`, `cap:add:android`, `cap:open:ios`,
  `cap:open:android`, `cap:sync`.

## Prerequisites

| Tool | Why | Install |
|---|---|---|
| Xcode 16+ | iOS build | App Store |
| Xcode Command Line Tools | `xcodebuild` | `xcode-select --install` |
| **CocoaPods** | iOS native deps | `sudo gem install cocoapods` (not currently installed — install before `cap:add:ios`) |
| Android Studio | Android build + emulator | <https://developer.android.com/studio> |
| JDK 17+ | Android Gradle | bundled with Android Studio |
| **Apple Developer Program** | App Store + push certs | <https://developer.apple.com/programs/> ($99/yr) |
| **Google Play Console** | Play Store | <https://play.google.com/console/> ($25 one-time) |

You can do all of this on the same Apple Silicon Mac that runs the FLUX
server.

## First scaffold

When you're ready to start the native build:

```sh
# 1. Install CocoaPods if you haven't (one-time)
sudo gem install cocoapods

# 2. Scaffold the iOS Xcode project (creates ios/ in repo root)
npm run cap:add:ios

# 3. Scaffold the Android Gradle project (creates android/ in repo root)
npm run cap:add:android

# 4. Commit both directories
git add ios/ android/
git commit -m "Scaffold Capacitor iOS + Android projects"
```

Both `ios/` and `android/` are meant to be checked into git — you'll
customize app icons, splash screens, `Info.plist`, `AndroidManifest.xml`,
and (eventually) push-notification entitlements there.

## Configuring icons + splash

The web app's existing icons under `public/icons/winner-victory.jpg` and
the dynamic `/icon` route are great for the PWA install but **don't apply
to the native build** — iOS and Android need pre-rendered raster icons
shipped in the `.ipa` / `.aab`. Capacitor's recommended tool is
[`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets):

```sh
npm install --save-dev @capacitor/assets
mkdir -p resources
# Drop a 1024x1024 PNG into resources/icon.png + resources/splash.png
npx capacitor-assets generate
```

The current app icon (May 12 champion's victory portrait) is at
`public/icons/winner-victory.jpg` if you want a starting point.

## iOS build / TestFlight submission

```sh
# Sync any web-side changes to native (cheap; just refreshes the WebView
# bundle id, server URL, plugins). Re-run any time you change
# capacitor.config.ts.
npm run cap:sync

# Open the Xcode project — from here you'll set the signing team,
# bundle id, target iOS version, etc.
npm run cap:open:ios

# In Xcode:
#   Product → Archive
#   Distribute App → App Store Connect → Upload
#   Wait for processing (~10 min)
#   In App Store Connect, add to TestFlight internal testing
```

Expected first-submission timeline:
- **Apple Developer enrollment** — 1-2 days (DUNS lookup, identity check).
- **App Store Connect setup** — half a day (app record, screenshots,
  privacy strings).
- **TestFlight internal testing** — same day after upload completes.
- **App Store review** for public release — 1-7 days (variable). Budget
  two weeks for a first submission to land cleanly; expect at least one
  rejection round on privacy strings / screenshot ratios / "minimum
  functionality."

## Android build / Play Console submission

```sh
npm run cap:sync
npm run cap:open:android

# In Android Studio:
#   Build → Generate Signed App Bundle / APK → Android App Bundle (.aab)
#   First time: generate a keystore. STORE THE KEYSTORE FILE + PASSWORD
#   SOMEWHERE SAFE — losing it means you can never update the app.
```

Then upload the `.aab` to Play Console under the app's
"Internal testing" track. Faster than Apple — typically same-day live.

## Push notifications (optional, deferred)

Phase 6 in the migration roadmap names push as a "do this when matches go
async" follow-up. The wiring is roughly:

1. `npm install @capacitor/push-notifications`
2. On app start, call `PushNotifications.requestPermissions()` →
   `PushNotifications.register()` → grab the device token in the
   `registration` listener.
3. POST the token to a new server action `registerPushTokenAction` (add a
   `push_tokens` table keyed on `(player_id, platform, token)`).
4. In server actions that should notify (e.g. `confirmRoundAction`), fan
   out APNs / FCM sends to every push token associated with affected
   players. Use [Firebase Admin SDK](https://firebase.google.com/docs/cloud-messaging/server)
   for both platforms (FCM proxies to APNs for iOS via a one-time APNs key
   upload in the FCM console).

About half a day of work each side once you decide to build it.

## What survives the wrap (from `docs/migration-review/mobile-future.md`)

| Layer | iOS WKWebView | Android WebView |
|---|---|---|
| Server-rendered HTML / RSC | ✅ | ✅ |
| Server actions | ✅ | ✅ |
| `cookies()` auth | ✅ (cookies are first-party on `mtg.capxun.com`) | ✅ |
| SSE / `@upstash/realtime` | ✅ | ✅ |
| Wake Lock | ✅ | ✅ |
| Vercel Blob image loads | ✅ | ✅ |
| `<input type="file" accept="image/*">` → camera | ✅ | ✅ |

Auth is the most likely gotcha. If you ever see "logged out on every app
launch," check that the prod site is serving cookies with `SameSite=Lax`
or `SameSite=None; Secure` (currently Lax). WKWebView persists Lax cookies
across launches for first-party domains, which is what we have.

## What's expensive about going native

- **The first submission.** Apple's review process is opaque and slow.
  Budget two weeks of calendar time and at least one rejection cycle.
- **Keystore custody on Android.** Lose the keystore → lose the ability to
  update the app forever. Back it up.
- **App icons need pre-rendering.** The dynamic `/icon` route doesn't help
  the native build — you have to ship a 1024×1024 PNG in resources/ and
  regenerate per-size variants.
- **Push needs APNs cert + FCM project setup.** Roughly half a day each
  side, plus storing the certs somewhere durable.

## When to actually do this

The original mobile-future review's bias was "polish the PWA first, only
go native when there's a concrete reason." Concrete reasons that might
trigger this:

- A player wants a TestFlight link.
- Multi-night async matches → push notifications become valuable.
- You want App Store visibility (you decide it's a "product," not just
  Andrew's home tool).

Until one of those, the PWA install on `mtg.capxun.com` with the
home-screen icon and Wake Lock from Phase 0 is the right surface.
