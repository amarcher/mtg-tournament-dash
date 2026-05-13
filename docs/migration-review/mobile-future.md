# Mobile / native future

A "future, not now" lens on turning the phone-player UI into a native app. The TV broadcast view stays on the host laptop's Chrome/Safari — only `/events/[id]/play` (the `PlayClient`) is a candidate to "go native."

The headline: **invest one to two days in PWA polish and stop there until you have a concrete pain point.** Capacitor and Expo are real options, but every dollar of native work compounds against an actively-evolving Next.js app.

---

## 1. Current PWA-installable state

What exists today:

- `src/app/apple-icon.tsx` — 180×180 iOS home-screen icon generated via `next/og`. Good.
- `src/app/icon.tsx` — not present; Next.js falls back to `src/app/favicon.ico`. Acceptable for Android Chrome, suboptimal for high-DPI maskable icons.
- `src/app/opengraph-image.tsx`, `src/app/twitter-image.tsx` — present; helps social previews but unrelated to install.
- `metadata` in `src/app/layout.tsx` — title, description, OG, Twitter. **No `viewport` export, no `themeColor`, no `manifest`.**

What's missing for a polished "Add to Home Screen":

| Gap | What to add | Impact |
|---|---|---|
| No `manifest.webmanifest` | `src/app/manifest.ts` exporting `MetadataRoute.Manifest` with `name`, `short_name: "MTG"`, `start_url: "/"`, `display: "standalone"`, `background_color: "#09090b"`, `theme_color: "#09090b"`, an icons array (192, 512, plus a maskable 512) | Required on Android for the proper install prompt. iOS reads `name`/`short_name`/`theme_color`. |
| No `viewport` export | `export const viewport: Viewport = { themeColor: "#09090b", colorScheme: "dark" }` in `layout.tsx` | iOS status bar matches the app's near-black background instead of flashing white. |
| No `apple-mobile-web-app-*` meta | `appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MTG" }` inside `metadata` | iOS standalone mode, hides Safari chrome on home-screen launch. |
| No 192/512 raster icons | Either generate via `src/app/icon.tsx` (multiple sizes) or commit PNGs under `/public/icons/`. The 512 should be maskable (safe zone in the inner 80%). | Android install prompt + splash screen. |
| No service worker | None today. `next-pwa` is the usual wrapper, but for an LAN/tunnel app the only real win is **caching the app shell** so the phone keeps showing the last UI when the host laptop dies mid-round. The realtime layer (SSE + 3s poll fetch) does not need offline fallbacks — it already self-heals. | Resilience, not offline-first. |
| No install prompt UX | An optional `beforeinstallprompt` listener on `/events/[id]/play` that shows a one-time "Install MTG to your home screen" banner to Android Chrome users. iOS users have to do it manually via the Share sheet — a static "How to install on iOS" hint on the claim page covers that. | Discoverability. Today most players don't even know they can install it. |

Selfie capture is **already correct** — `WizardForm.tsx` uses `<input type="file" accept="image/heic,image/heif,image/jpeg,image/png,image/webp,image/*">` which on iOS Safari and Android Chrome opens the native camera/library picker. No `capture` attribute needed; adding `capture="user"` would force the front camera and remove the library option, which is worse.

Effort to close all gaps above: ~4–8 hours, no new dependencies (Next.js 16 supports `app/manifest.ts` natively).

---

## 2. What native would unlock vs. current web

Specifically for the phone-player UI:

| Capability | Web today | Polished PWA | Native (Capacitor/Expo) |
|---|---|---|---|
| Push notifications ("your turn", "round started") | Not possible | **iOS 16.4+ only when installed via Add to Home Screen**, Android Chrome unrestricted. Requires VAPID keys, a push endpoint, and a service worker. | Reliable on both platforms via APNs/FCM. |
| Selfie capture | Works (file picker → camera) | Same | Same, plus optional in-app camera with custom UI. Not a real win. |
| Lock-screen / always-on during a match | Goes to sleep | Same — no web API for this | Native `keepAwake` plugin. **Real win** for a 50-min round on the phone. |
| App Store discovery | None | None | Listed. Discovery for a kitchen-table app is ~zero; this is not a real win. |
| Offline support | Crashes if Wi-Fi dies | Service worker can keep the last UI on screen; mutations queue or fail visibly | Same as PWA — Capacitor uses the same WebView. Expo could persist mutations natively but it's overkill. |
| Update cadence | Instant (deploy) | Instant | Capacitor: instant *for HTML/JS*, app-store review for native shell changes. Expo OTA: instant for JS, native rebuild for native deps. |
| Auth | httpOnly cookie + `cookies()` | Same | Capacitor: cookies work in the WebView. Expo: cookies do *not* survive — you'd need to rewrite `src/lib/auth.ts` to issue a bearer token. |

The only **real** wins specific to native are (a) reliable push and (b) keep-screen-awake during a round. Both can be argued against:

- **Push:** the players are physically in the same room as the host TV. The broadcast view's QR + the in-room shout is already the notification channel. Push only matters if matches go async (players in different rooms, or multi-night leagues where rounds span days). Until that's the use case, push is a feature in search of a problem.
- **Keep-awake:** can be partially solved on the web with [`Wake Lock API`](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) (Chrome/Safari 16.4+). Roughly 20 lines of code in `PlayClient` to request a wake lock when a match is in progress and release it when complete. **This is the single highest-leverage non-PWA change** and doesn't require any install or native shell.

---

## 3. Options comparison

| Option | One-time cost | Annual cost | Unlocks | Maintenance burden | App-Store review |
|---|---|---|---|---|---|
| **A. PWA polish** (manifest + viewport themeColor + icons + optional service worker + Wake Lock) | 1–2 days | $0 | Standalone-mode install, status bar theming, Wake Lock during rounds, eventual push on iOS 16.4+. | Zero — it's the same codebase. | None. |
| **B. Capacitor wrap** of the existing Next.js app | 2–3 days initial + per-release rebuild of the iOS/Android shell | $99/yr Apple Developer + $25 one-time Google Play | App-Store listing, native push (APNs/FCM via plugin), keep-awake, splash, app icon on iOS without "Add to Home Screen" friction. | Moderate — every dependency bump on the web side needs at least a smoke test in the WebView. App-Store rejections happen for trivial reasons (privacy strings, screenshot ratios). | Yes — every release that touches native deps. Initial submission is the painful one (~1–2 weeks). |
| **C. Expo / React Native rewrite** of `PlayClient` | 2–4 weeks (rewrite `PlayClient`, rewrite auth as bearer tokens, rebuild the SSE/poll client, build/CI pipeline) + ongoing dual maintenance | $99 + $25 + EAS Build credits ($0–$99/mo) | Truly native UI, best performance, native gesture/haptics. **Doesn't unlock anything you couldn't get from B.** | High — two codebases for the same screens, two deploy pipelines, divergence over time. | Yes, same as B. |

Capacitor specifics that matter for this codebase:

- **What survives the Capacitor wrap:** RSC, server actions, cookie-based auth (`src/lib/auth.ts`), `revalidatePath`, the SSE stream, the polling reconcile loop, the file proxy at `/files/[file]`. Capacitor is just a WebView pointing at your Cloudflare tunnel URL — the entire backend is unchanged. The shell only ships icons, splash, and a thin native bridge.
- **What needs reconfiguration:** the WebView lives at `capacitor://localhost` on iOS, so the server's `Set-Cookie` headers need `SameSite=None; Secure` and the tunnel needs to be HTTPS (it already is). The selfie multipart upload still hits the same WAF rule — `npm run cf:skip-waf` already handles it.
- **What needs new code:** a `@capacitor/push-notifications` plugin call on launch to register the device token with a new server action `registerPushTokenAction`, plus an APNs/FCM sender in the wizardize/round-start paths. ~half a day each side.

Expo specifics:

- **Nothing survives** below the URL level. You'd be reimplementing `PlayClient`, the SSE handling, the polling, the avatar tier picker UI, the wizard tier crossfades, and most importantly the cookie auth (replace with a bearer token issued by a new `/api/auth/exchange` route). The Drizzle/Neon/FLUX backend is untouched.
- **The only reason to do this** is if you decide the phone-player UI deserves to look and feel materially different from the web — true native gestures, large-format haptics, fully redesigned for one-handed thumb use. The current `PlayClient` is already a thumb-friendly +/-1, +/-5, "I won / They won" layout, so the marginal UX win is small.

---

## 4. Sequencing recommendation

Do them in this order, and **stop at the lowest tier that solves a real problem you're actually having**:

1. **Today (1–2 days):** PWA polish (Option A). Manifest, viewport themeColor, maskable 512 icon, `appleWebApp` metadata, a 5-line Wake Lock hook in `PlayClient`. This makes the existing "Add to Home Screen" flow feel intentional and prevents the phone from sleeping mid-round. Zero dependencies, zero cost.

2. **When a real user asks for it (~half a day):** add the install-prompt UX. A one-time banner on `/events/[id]/play` for Android Chrome (uses `beforeinstallprompt`), a static "tap Share → Add to Home Screen" hint for iOS. Don't ship this until you've actually seen players struggle to install — premature install prompts annoy people more than they help.

3. **When matches start spanning multiple rooms or evenings:** add web push (via service worker + VAPID + Notification API). This works on Android Chrome immediately and on iOS 16.4+ for installed PWAs. Same dependency tree as the service worker you'll have built in step 1. ~2 days. Still no native shell.

4. **When a TestFlight link would unblock a specific player or you want App Store presence for a different reason (e.g. selling it):** Capacitor wrap (Option B). At that point the web app is mature, push is already designed, and you're just packaging. ~3 days plus the App Store submission slog.

5. **Probably never:** Expo rewrite. The only scenario this makes sense is if MTG Dash becomes a commercial product and you need a competitive native UX. If you reach that point, the question to ask is not "should we rewrite in Expo" but "do we hire someone for this."

---

## 5. What survives each step (cheat sheet)

| Layer | PWA | Capacitor | Expo |
|---|---|---|---|
| Server-rendered HTML / RSC | Same | Same (WebView) | Gone — REST/JSON only |
| Server actions (`src/app/events/actions.ts`) | Same | Same | Callable as REST, lose the type-safe call site |
| `cookies()` auth in `src/lib/auth.ts` | Same | Same (with `SameSite=None; Secure`) | Rewrite as bearer token |
| SSE `/api/events/[id]/stream` + polling | Same | Same | Reimplement as `EventSource` polyfill or WebSocket |
| Wizard avatar tiers / `pickAvatarUrl` | Same | Same | Reimplement |
| `/files/[file]` proxy | Same | Same | Same |
| Cloudflare WAF skip rule | Same | Same | Same |

---

## 6. Things to skip / non-issues

- **"Do we need an app to look professional?"** No. For kitchen-table tournaments the QR-on-the-broadcast → claim page flow is *better* than an app — there's nothing to install and nothing to update. An app would add friction for casual guests.
- **"Will Apple reject us?"** Capacitor wraps of legitimate web apps are routinely accepted, but expect at least one rejection round (privacy strings, screenshot copy, "minimum functionality"). Budget two weeks for the first submission and zero days of dignity.
- **"Do we need a native camera?"** No. The web file picker on both iOS and Android already opens the camera or library at the user's choice, and the HEIC pipeline already handles iPhone selfies.
- **"Should we adopt React Native now to be ready later?"** No. The cost is real (dual codebase, dual deploys, dual mental model) and the benefit is hypothetical. If "later" comes, the rewrite is a few weeks of focused work — much cheaper than carrying two codebases for months waiting.
- **"Offline-first?"** No. The whole product is multiplayer realtime — if the host laptop is unreachable, there's no game to play. A service worker that keeps the *last rendered UI* visible during a brief network blip is enough.
- **"App Store SEO / discovery?"** No measurable upside for a friends-and-family tool. If MTG Dash becomes a hosted SaaS, revisit.

---

## The single thing to do today that makes any future native cheaper

Add `src/app/manifest.ts` + the `viewport`/`appleWebApp` metadata to `src/app/layout.tsx`. Capacitor reads the same manifest for the app name, icons, and splash colors, so doing this work now is **not throwaway** — it's the input to a hypothetical Capacitor wrap, while also being the entire deliverable for the PWA path. One change, two roads forward.
