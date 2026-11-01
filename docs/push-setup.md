# Push notifications: what has to be set up by hand

The code for push is in the repo and ships dark: until the keys below are in
Vercel's environment, a send is logged as `failed` with an `*_not_configured`
reason and nothing else changes. Until a store build carries the plugin, the
Notifications card never appears (the web never shows it, and an older shell
reports the plugin as unavailable). The pattern is the one Crossword Clash
uses (`crossword-clash/docs/push-setup.md`), minus Supabase: here the sender
is `src/lib/push.ts`, called from the server actions that confirm a round,
open a date poll and add game nights, and it runs on Vercel after the
response goes out.

What a player sees: nothing until they tap **Turn on notifications** on the
Play tab's Notifications card (native shell only). The OS prompt appears then,
once. Two switches follow: round pairings, and dates to answer (polls and game
nights). "Turn off on this phone" deletes the device row.

Order: the Apple side, the Google side, the Vercel switches, the store forms,
then a build.

**Status, 2026-11-01:** sections 1 to 3 are done (Push capability on the App
ID, profile `5FT855H9B5` installed, Firebase app
`1:947795730277:android:2c1873c41dc6264b2a8b8c` in the `crossword-clash`
project, the four variables in Vercel for all three environments, and
`npm run verify` driving the real gateways). iOS build 6 went to App Store
Connect the same day (`npm run ios:release -- --upload`) and the Android
versionCode 3 bundle was built. Left: the store forms in section 4 and the
Play Console upload of `android/app/build/outputs/bundle/release/app-release.aab`
(the Crossword Clash `play-publisher` service account has no permission on
this Play app, so the upload is by hand until one is granted in Play Console
→ Users and permissions).

---

## 1. Apple: capability, key, profile

MTG Dash and Crossword Clash sign with the same personal team (`J39B2498YF`),
and an APNs authentication key is team-wide, so **the existing key is reused**:
Key ID `XCYXKS23C7`, `.p8` at
`~/.appstoreconnect/private_keys/AuthKey_XCYXKS23C7.p8`. No new key.

Still to do for this app:

1. **Add the Push Notifications capability to the App ID** `com.capxun.mtgdash`
   (bundle id resource `UNXYHW36H9`), through the ASC API the same way
   Associated Domains was added on 2026-10-27
   (`POST /v1/bundleIdCapabilities` with `capabilityType: PUSH_NOTIFICATIONS`).
   `ios/App/App/App.entitlements` already carries `aps-environment:
   production`; a build made before the capability exists fails to register
   (the plugin's `registrationError`), nothing worse.
2. **Recreate the App Store profile.** A capability change invalidates the
   manual profile the upload path signs with ("MTG Dash App Store"; the id
   changes with every recreate, `5FT855H9B5` since 2026-11-01, cert
   "Apple Distribution: Andrew Archer (J39B2498YF)").
   DELETE it, POST a new `IOS_APP_STORE` profile with the same name, bundle
   id `UNXYHW36H9` and the same certificate, write its `profileContent` under
   `~/Library/MobileDevice/Provisioning Profiles/<uuid>.mobileprovision` and
   remove the old file; `security cms -D -i <file>` must show
   `aps-environment` and the associated domain. `docs/native-app.md` has the
   fetch-by-name fallback.
3. Confirm the key still works against this topic: a `POST` to
   `https://api.push.apple.com/3/device/<bogus>` with `apns-topic:
   com.capxun.mtgdash` and an ES256 provider token must answer
   `400 BadDeviceToken` (the token was accepted); `403 InvalidProviderToken`
   means the key or team is wrong.

## 2. Google: a Firebase app for the package

FCM needs a Firebase project with an Android app for `com.capxun.mtgdash` and
a service account allowed to send. Crossword Clash attached Firebase to its
existing Cloud project from the CLI; do the same here, either on a new
project (`mtg-dash`) or by adding a second Android app to the
`crossword-clash` project (one project can hold both; the service account
and quota are then shared). Done 2026-11-01 the second way: MTG Dash is a
second Android app in `crossword-clash`, the sender is
`fcm-sender@crossword-clash.iam.gserviceaccount.com` and its key stays at
`~/.config/crossword-clash/fcm-service-account.json` (one copy of the
secret, used by both apps).

1. `gcloud services enable firebase.googleapis.com fcm.googleapis.com`, then
   `POST https://firebase.googleapis.com/v1beta1/projects/<project>:addFirebase`
   (skip when the project already has Firebase) and
   `POST …/projects/<project>/androidApps` with `packageName:
   com.capxun.mtgdash`. Both calls want a `gcloud auth print-access-token`
   bearer and `x-goog-user-project: <project>`.
2. `GET …/androidApps/<appId>/config` returns `google-services.json`
   base64-encoded. **Commit it at `android/app/google-services.json`** (it
   holds no secret; `android/app/build.gradle` applies the Google services
   plugin only when the file exists, and `android/build.gradle` already has
   the plugin on its classpath).
3. A sender service account with `roles/firebasecloudmessaging.admin`.
   Crossword's `fcm-sender@crossword-clash.iam.gserviceaccount.com` can be
   reused if the Android app lives in that project; otherwise make one and a
   JSON key, stored at `~/.config/mtg-dash/fcm-service-account.json` (mode
   600, never in the repo).

## 3. Vercel environment

Production (and Preview, so a preview deploy can be smoke-tested):

| Variable | Value |
|---|---|
| `APNS_KEY_ID` | `XCYXKS23C7` |
| `APNS_TEAM_ID` | `J39B2498YF` |
| `APNS_P8` | the `.p8` file's whole PEM text (`vercel env add APNS_P8 production < AuthKey_XCYXKS23C7.p8`) |
| `APNS_BUNDLE_ID` | optional, defaults to `com.capxun.mtgdash` |
| `APNS_SANDBOX` | leave unset; `1` only for an Xcode-run development build, which registers against the sandbox gateway |
| `FCM_SERVICE_ACCOUNT` | the service-account JSON, **base64-encoded**: `base64 < fcm-service-account.json \| tr -d '\n' \| vercel env add FCM_SERVICE_ACCOUNT production`. The raw JSON also parses at runtime, but `vercel env pull` writes it in a form dotenv mangles (the private key's `\n` escapes), so the local harness would see no account |

`PUBLIC_URL` is not set in Vercel; the links inside a notification fall back
to `https://mtg.capxun.com` (`DEFAULT_SITE`), right for production and
harmless on previews. Then `vercel env pull .env.local` so `npm run verify` exercises the real
gateways (its fake tokens are refused as `BadDeviceToken` / `UNREGISTERED`,
which the harness accepts; `failed` with `*_not_configured` is what it sees
before this step).

## 4. Store forms

- **App Store Connect → App Privacy**: add *Identifiers → Device ID* (the
  push token), collected, linked to the user, App Functionality, not used
  for tracking. The app has no `PrivacyInfo.xcprivacy` yet; the form is
  what review reads for a first-party app.
- **Play Console → Data safety**: *Device or other IDs* (the FCM token and
  the Firebase installation id), collected, not shared (Google is the
  service provider), required, App functionality. The Android 13
  notification permission itself needs no declaration.
- The privacy policy page should name the push token under "What is
  stored" once the policy PR (amarcher/mtg-dash#86) has landed.

## 5. A build

Everything native is in the repo already: the plugin in `Package.swift` and
`capacitor.settings.gradle` (from `npm run cap:sync`), the entitlement, the
`AppDelegate` hooks, `POST_NOTIFICATIONS`, the status-bar icon and the
default channel in `AndroidManifest.xml`, and `presentationOptions` in
`capacitor.config.ts`. Bump `CURRENT_PROJECT_VERSION` / `versionCode` and
`NATIVE_BUILDS`, then follow `docs/native-app.md` for TestFlight and Play.

A shell older than this build keeps working: `pushSupported()` checks
`Capacitor.isPluginAvailable("PushNotifications")`, so the card stays hidden
and nothing is registered until the update banner is taken.

## 6. Smoke test

On a phone running the new build, open a league you have claimed a wizard
in and tap **Turn on notifications**. Then, from a shell with
`.env.local` pulled:

```bash
npx tsx -e 'import("./src/lib/push.ts").then(async (m) => { const { db } = await import("./src/db/client.ts"); const { pushDevices } = await import("./src/db/schema.ts"); const [d] = await db.select().from(pushDevices).orderBy(pushDevices.lastSeenAt); console.log(await m.sendTestNotification(d.token)); })'
```

`{ outcome: "sent" }` and a banner on the phone is the whole test. Then pair
a round in a scratch event: everyone seated with the switch on gets "Round 1
is starting · Table 2 vs …", and a tap lands on `/events/<id>/play`.

## 7. Reading the log

```sql
select kind, outcome, reason, count(*) from push_log
where sent_at > now() - interval '1 day' group by 1, 2, 3 order by 1, 2;
```

`unregistered` rows are phones that uninstalled (their device rows are
deleted as they are seen); `opted_out` is a switch doing its job; `failed`
with a reason is the thing to read. There is no retention sweep yet;
`push_log` grows by at most a few rows per round.
