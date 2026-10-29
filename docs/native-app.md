# Native iOS / Android wrap (Capacitor)

This repo ships a Capacitor configuration that wraps the production web app
(`https://mtg.capxun.com`) as a native iOS + Android binary. The wrap is
intentionally minimal: a `WKWebView` (iOS) / `WebView` (Android) pointing at
the live URL. No bundled JS, no offline mode, no client-side state
duplication. Everything that works in mobile Safari / Chrome on
`mtg.capxun.com` works in the app — and any deploy to Vercel is instantly
live in the app, no resubmission required.

**Status:** scaffolded and building locally (Oct 27 2026). `ios/` (Swift
Package Manager — no CocoaPods) and `android/` are checked in, icons and
splash are generated from `resources/`, and the keep-awake plugin is wired
into `useWakeLock`. App records exist on both stores (created Oct 27 2026) but no build has
been uploaded yet — see "Signing" below before the first upload.

- **App Store Connect**: app id `6827733846`, personal team `J39B2498YF`,
  bundle id resource `UNXYHW36H9`, SKU `mtgdash`.
  <https://appstoreconnect.apple.com/apps/6827733846>
- **Play Console**: app id `4975058745949277854` under the **Fable Designer**
  organization account (`6294983081887284734`; the old personal "archer"
  account was closed in 2021). Package `com.capxun.mtgdash`, free app,
  automatic installer protection left on.
  <https://play.google.com/console/u/7/developers/6294983081887284734/app/4975058745949277854/app-dashboard>

## What's already in the repo

- `capacitor.config.ts` — app id `com.capxun.mtgdash`, name "MTG Dash",
  `server.url` pointing at the prod web URL.
- `@capacitor/core`, `@capacitor/ios`, `@capacitor/android` in dependencies.
- `@capacitor/cli` in devDependencies.
- npm scripts: `cap:add:ios`, `cap:add:android`, `cap:open:ios`,
  `cap:open:android`, `cap:sync`.
- `ios/App` (SPM template: `App.xcodeproj` + `CapApp-SPM/Package.swift`)
  and `android/`. Re-run `npm run cap:sync` after changing
  `capacitor.config.ts` or adding a plugin.
- `resources/icon.png`, `splash.png`, `icon-foreground.png`,
  `icon-background.png` — 1024/2732 sources cut from the champion portrait.
  Regenerate every native size with
  `npx capacitor-assets generate --iconBackgroundColor '#0d0a07' --splashBackgroundColor '#0d0a07'`,
  then delete the `icons/` and `public/manifest.webmanifest` it also writes:
  a static `public/manifest.webmanifest` would shadow the personalized
  manifest route handler.
- `@capacitor-community/keep-awake`: `src/lib/use-wake-lock.ts` holds the
  native idle-timer override whenever `Capacitor.isNativePlatform()`, on top
  of the web Screen Wake Lock. The bridge is injected into pages loaded from
  `server.url`, so the web bundle can import `@capacitor/core` safely — on a
  plain browser `isNativePlatform()` is false and the plugin is never called.
- `@capacitor/status-bar` plus the `StatusBar` / `SystemBars` blocks in
  `capacitor.config.ts`: canvas-colored, light-text status bar with the
  WebView inset below it on iOS. On Android 15+/16 edge-to-edge is enforced
  by the OS, so the status bar overlays the page and the site's own
  `env(safe-area-inset-*)` padding (AppChrome header, tab bar, Scoreboard)
  has to carry it — check this on a real Android device before shipping.
- `ios/App/App/Info.plist` carries camera + photo-library usage strings (the
  selfie `<input type="file">` opens the camera sheet) and
  `ITSAppUsesNonExemptEncryption=false`; `AndroidManifest.xml` adds
  `CAMERA`.
- **Android upload key** is outside the repo at `~/.mtg-dash/upload.keystore`
  with `~/.mtg-dash/keystore.properties` next to it (both mode 600).
  `android/app/build.gradle` reads that properties file when present and
  signs `release` with it; without it release builds are unsigned. Back both
  files up to the password manager — losing the key means never updating the
  Play listing again.

## Prerequisites

| Tool | Why | Install |
|---|---|---|
| **Xcode 27.1+** (iOS 27.1 SDK) | iOS build — the SDK decides how the shell looks on the iPhone Duo; `npm run ios:verify` refuses an older one. See "iPhone Duo" below. | App Store |
| Xcode Command Line Tools | `xcodebuild` | `xcode-select --install` |
| CocoaPods | not needed — the iOS project uses Swift Package Manager | — |
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

## Signing

Two Apple teams exist on this Mac (see the `app-store-upload` skill). MTG
Dash builds with the **personal** team `J39B2498YF` (Andrew Archer,
Individual) — pass `DEVELOPMENT_TEAM=J39B2498YF` on the `xcodebuild` line or
set it once in Xcode's Signing & Capabilities. The first build uploaded to
App Store Connect permanently binds `com.capxun.mtgdash` to whichever team
signed it, so don't upload from the Fable Designer team by accident.

Local build commands that work without Xcode's GUI:

```sh
# iOS: the Xcode 27.1 check, then an unsigned simulator build. Run it before
# archiving (scripts/ios-verify.sh).
npm run ios:verify

# iOS release: cap sync, signed archive on the personal team, export, team
# read back off the .ipa, then (with --upload) altool to App Store Connect /
# TestFlight. Needs APPLE_TEAM_ID=J39B2498YF plus ASC_API_KEY_ID /
# ASC_API_ISSUER_ID (the personal-team set in ~/.zshrc; never the FABLE_* set).
# Bump CURRENT_PROJECT_VERSION and NATIVE_BUILDS.ios together first.
npm run ios:release -- --upload

# Android: debug APK (sideload), release APK + AAB (signed when the upload key is present)
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew assembleDebug assembleRelease bundleRelease
# outputs under android/app/build/outputs/{apk,bundle}/
```

Use Android Studio's bundled JDK as above; the system `java` (26) is newer
than Gradle 8.14 supports.

## iPhone Duo

Apple's foldable (on sale 2026-10-23): closed, a short wide phone whose camera
and status bar sit in a strip down the **right** edge, an asymmetric safe-area
inset; open, an iPad-shaped inner screen with regular/regular size classes.
Learned on Crossword Clash (its `docs/big-screens-research.md` has the sources)
and applied here on 2026-10-29.

- **Build with Xcode 27.1 or later.** The build SDK, not the code, decides how
  the shell looks: an archive from Xcode 26 runs letterboxed at phone size on
  the inner screen and left of the camera strip on the outer one; one from the
  iOS 27.1 SDK fills both. `npm run ios:verify` refuses an older Xcode. Apple
  requires Duo screenshots in App Store Connect from April 2027 for builds made
  with 27.1.
- **Fixed overlays carry the side insets themselves.** `body` pads
  `env(safe-area-inset-left/right)`, which in-flow content inherits, but a
  `position: fixed` element ignores it. The sheet, the tab bar, the update
  banner, the portrait lightbox and the broadcast view pad the side insets
  (the fills stay full-bleed), so nothing sits under the Duo's camera strip.
  Any new fixed or portalled overlay needs the same two classes.
- **Orientation needs nothing.** The outer screen honours the iPhone list
  (portrait + landscape); the inner screen ignores orientation lists and hands
  the page regular/regular size classes, where the site's wider layouts apply.
  The web side needs no Duo detection and Apple says there will be none.
- **Unverified on a Duo simulator** (needs the Xcode 27.1 runtime, macOS
  only): check the scorekeeper and the tab bar on the outer screen, and a
  half-open pose on the inner one, before the next store build.

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

What actually works on this Mac, start to finish, without Xcode's GUI
(first done 2026-10-27; build 1.0 (1) is on TestFlight):

```sh
npm run cap:sync
cd ios/App
# 1. Archive, signed with the personal team's development identity via the ASC API key
xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' -archivePath "$OUT/MTGDash.xcarchive" archive \
  DEVELOPMENT_TEAM=J39B2498YF -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.appstoreconnect/private_keys/AuthKey_$ASC_API_KEY_ID.p8" \
  -authenticationKeyID "$ASC_API_KEY_ID" -authenticationKeyIssuerID "$ASC_API_ISSUER_ID"
# 2. Export as an App Store build — MANUAL signing with the API-created profile
#    "MTG Dash App Store" (profile id M4NHR37XU2, cert "Apple Distribution: Andrew
#    Archer (J39B2498YF)"). Automatic signing + -allowProvisioningUpdates does NOT
#    create the App Store profile and fails with "No profiles for 'com.capxun.mtgdash'".
xcodebuild -exportArchive -archivePath "$OUT/MTGDash.xcarchive" -exportPath "$OUT/export" \
  -exportOptionsPlist ExportOptions.plist   # method app-store-connect, signingStyle manual,
                                            # provisioningProfiles {com.capxun.mtgdash: "MTG Dash App Store"}
# 3. Upload
xcrun altool --upload-app -f "$OUT/export/App.ipa" -t ios \
  --apiKey "$ASC_API_KEY_ID" --apiIssuer "$ASC_API_ISSUER_ID"
```

If the profile is missing locally, re-fetch it:
`GET /v1/profiles?filter[name]=MTG%20Dash%20App%20Store` and write the
base64 `profileContent` to `~/Library/MobileDevice/Provisioning Profiles/<uuid>.mobileprovision`.

Bump `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj`
before each upload — App Store Connect rejects a reused build number — and
`NATIVE_BUILDS.ios` in `src/lib/native-version.ts` in the same change (the
unit test fails if they disagree). Deploying that bump is what makes
installed shells show the in-app "Update" banner.

TestFlight groups (App Store Connect app `6827733846`):

- **MTG Dash Team** (internal, `aa627550-…`) — App Store Connect users;
  every processed build is available to them immediately, no review.
- **MTG Dash Testers** (external, `03d256ed-…`) — invite-by-email; the
  first build in a version needs Beta App Review. Build 1.0 (1) was
  submitted 2026-10-27 (Test Information uses the Fable Designer business
  phone as the review contact); later builds of the same version skip it.

Both were seeded 2026-10-27 with the union of the Space Race and Fable Reader
TestFlight testers.

## Android build / Play Console submission

```sh
npm run cap:sync
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease
# -> android/app/build/outputs/bundle/release/app-release.aab, signed with ~/.mtg-dash/upload.keystore
```

Bump `versionCode` in `android/app/build.gradle` and `NATIVE_BUILDS.android`
in `src/lib/native-version.ts` before each upload.

Upload the `.aab` in Play Console → MTG Dash (app `4975058745949277854`,
Fable Designer org) → Testing → Internal testing → Create new release. The
internal track uses the account-level **Internal** email list (the same
list Space Race uses); release 1 (1.0) went live 2026-10-27. Until the
store listing is finished and reviewed, testers see the temporary name
`com.capxun.mtgdash (unreviewed)` in Play.

`resources/` deliberately has no `splash-dark.png`: the dark splash was a
byte-identical copy of the light one and `capacitor-assets` turned it into
4.9 MB of duplicate `drawable-*-night-*` PNGs. Android falls back to the
non-night drawable, so nothing is lost. If you ever want a real dark
splash, add a genuinely different image.

## Deep links: Universal Links (iOS) and App Links (Android)

Links to `mtg.capxun.com` open the installed shell instead of Safari/Chrome,
which is what makes sign-in codes, claim links and table QR codes land in
the app's own cookie jar.

- Association files are route handlers:
  `src/app/.well-known/apple-app-site-association/route.ts` (app id
  `J39B2498YF.com.capxun.mtgdash`, everything except `/api/*` and `/files/*`)
  and `src/app/.well-known/assetlinks.json/route.ts` (package
  `com.capxun.mtgdash` with the Play app-signing, upload and debug cert
  SHA-256s — all three, or links only verify for one kind of build).
- iOS: `ios/App/App/App.entitlements` carries
  `applinks:mtg.capxun.com`; the App ID has the Associated Domains
  capability (added via the ASC API 2026-10-27) and the App Store profile
  was regenerated afterwards — profiles bake entitlements in, so any future
  capability change means delete + recreate the profile.
- Android: the `VIEW` intent filter with `android:autoVerify="true"` on
  `MainActivity` in `AndroidManifest.xml`.
- The web side: `src/app/components/NativeLinks.tsx` listens for
  `appUrlOpen` from `@capacitor/app` and pushes the path into the router.
- Apple caches the association file per install (its CDN fetches it on
  install/update), so after changing the AASA, reinstall the app to test.
  Check verification on Android with
  `adb shell pm get-app-links com.capxun.mtgdash`.

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
