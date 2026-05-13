# Migration roadmap — mtg-dash → managed cloud

> Plan-of-record after multi-agent review on 2026-05-13. Supersedes the
> initial sketch in `docs/vercel-migration.md` (kept for historical
> context). The four review documents under `docs/migration-review/` are
> the source-of-truth for the reasoning behind each choice:
>
> - `cost-and-hosting.md` — every component sits in free tier with order-of-
>   magnitude headroom. Expected bill: $0/mo.
> - `images-and-storage.md` — storage is a non-decision at our scale; local
>   FLUX is the right primary; fal.ai's FLUX.2 Klein ($2.40/yr) is a viable
>   future swap.
> - `iteration-and-architecture.md` — pressure-tests the SSE / pub/sub /
>   `after()` design and finds three soft spots worth fixing first.
> - `mobile-future.md` — PWA polish today, Capacitor only when there's a
>   real reason, Expo basically never.

## Headline answer to the user's questions

| Concern | Answer |
|---|---|
| Will this be expensive? | **No. $0/mo on Vercel Hobby + free tiers, 8–10× headroom on every metered axis.** |
| Will it box us in? | **No, with one fix:** keep an in-process fallback in `pubsub.ts` so `npm run dev` / `lan` / `verify` boot without Upstash creds. |
| Quick iteration on LAN-connected phones? | **Same as today.** `npm run lan` is untouched. Preview deploys replace `tunnel:named` for the "show someone else" loop (~60–120 s vs current 30 s build + tunnel — close to a wash). |
| Will we lose the local LLM? | **No.** Local FLUX stays the default. The plan refactors `src/lib/wizard.ts` so swapping to fal.ai later is ~1 day, not 1 week. |
| Are wizard portraits expensive in cloud storage? | **No.** ~120 MB/yr. Free Blob tier lasts ~8 years before tipping. **Your instinct was wrong at this scale.** |
| Could this become an iOS/Android app? | **Yes**, via Capacitor (~3 days) once we have a real reason. PWA polish today (1–2 days) does 80% of the work and is the input to a future Capacitor wrap. |
| Auth / mischief risk? | **Real but deferrable.** Once the site is public + stable, anyone with a join token can claim a seat. See "Deferred concerns" at the bottom. |

## Stack of record

```
Phones ──HTTPS──> Vercel Hobby (Next.js 16, Fluid Compute)
                    ├─ Neon Postgres (free, Marketplace)
                    ├─ Vercel Blob (Hobby, 1 GB included)
                    ├─ @upstash/realtime (Redis Streams + SSE, free)
                    └─ outbound HTTPS → imagegen.mised.tech tunnel
                                          (only during wizardize)

Mac at home: FLUX.2 Klein + cloudflared system tunnel (already running)
            — only required for *generating* portraits, not serving them.
```

Everything publicly visible runs on Vercel. The Mac is a dev convenience
plus an unpaid image-gen worker. If the Mac sleeps, the site keeps
working; only "generate me a new wizard" becomes unavailable until it
wakes.

---

## Phase 0 — Free wins, ship this week (1–2 days) ✅ Done

Independent of the cloud migration. Worth doing first.

1. **PWA polish** so phones get a proper "Add to Home Screen" experience.
   - Create `src/app/manifest.ts` exporting `MetadataRoute.Manifest` (name,
     `short_name: "MTG"`, `display: "standalone"`, `theme_color: "#09090b"`,
     `background_color: "#09090b"`, icons array including a maskable 512).
   - Add `export const viewport: Viewport = { themeColor: "#09090b",
     colorScheme: "dark" }` to `src/app/layout.tsx`.
   - Add `appleWebApp: { capable: true, statusBarStyle: "black-translucent",
     title: "MTG" }` inside `layout.tsx`'s `metadata`.
   - Generate (or commit) 192 and 512 maskable PNG icons.
2. **Screen Wake Lock in `PlayClient`** so phones don't sleep mid-round.
   ~5 lines using `navigator.wakeLock.request("screen")`.
3. **Lift `editOnce` in `src/lib/wizard.ts` behind a small interface.** Type
   `ImageEditor = (selfie: Buffer, prompt: string) => Promise<Buffer>` and
   pick the implementation from `IMAGE_GEN_PROVIDER` (default: `"local"`).
   This is the one-time tax that keeps "swap to fal.ai" as a ~1-day change
   later, instead of a week.

Done = better mobile install UX, longer match attention spans, and
optional cloud generation is design-ready.

---

## Phase 1 — Storage off the tunnel (1–2 days) ✅ Done

Goal: portraits live on Vercel Blob, so the site survives Mac sleep.

1. **Provision Vercel Blob** via the Marketplace on a new Vercel project
   linked to this repo. `BLOB_READ_WRITE_TOKEN` lands in env automatically.
2. **Rewrite the post-FLUX upload step** in `generateWizardAction`
   (`src/app/events/actions.ts`):
   - Replace the `POST ${IMAGEGEN_URL}/files/<name>` call with
     `put('avatars/<playerId>/<tier>.jpg', jpeg, { access: 'public',
     addRandomSuffix: false, allowOverwrite: true })` from `@vercel/blob`.
   - `addRandomSuffix: false` + `allowOverwrite: true` makes the Blob URL
     **stable** across regenerates — critical because `players.avatar*Url`
     is treated as immutable by OG-image and broadcast code paths.
3. **Wrap the fire-and-forget block in `after()`** from `next/server`.
   - Add `AbortSignal.timeout(240_000)` to each FLUX `fetch` so the work
     bails cleanly with ~60 s of slack before Vercel's 300 s function-
     duration kill.
4. **Rename `IMAGEGEN_URL` → `IMAGE_GEN_URL`** for consistency with
   recipe-guide. Make it optional: if unset, the wizard action throws a
   user-facing "Image generation isn't configured" error. In prod, set it
   to `https://imagegen.mised.tech`.
5. **Stale-job sweep.** Server-side helper that clears
   `wizardJobStartedAt` if `older than 6 min AND avatarUrl IS NULL`,
   called from `/players/[id]` and `/events/[id]/manage` page renders.
   Surface a "Generation failed — try again" banner when triggered.
6. **One-time migration script** `scripts/migrate-files-to-blob.ts`: walk
   every `players` row with an `avatar*Url` starting `/files/`, download
   via the legacy proxy, `put()` to Blob with the stable key, update the
   DB. Idempotent. Add to `npm run verify` as a fixture-only assertion.
7. **Defer deleting `src/app/files/[file]/route.ts`** until *all five*
   avatar URL columns across `players` show zero `/files/%` rows. This is
   Phase 4 cleanup, not now.

Done = portraits CDN-served from Vercel Blob; Mac required only for new
generation; OG unfurls keep working when the Mac is off.

---

## Phase 2 — Cross-instance real-time (2–3 days) ✅ Done

Goal: SSE works correctly when Vercel scales beyond one function instance.

1. **Adopt `@upstash/realtime`** instead of hand-rolling Redis pub/sub
   over `@upstash/redis`. The first-party SDK is purpose-built for "Redis
   Streams + SSE + Next.js + Vercel", handles reconnect/history out of the
   box, and is the substrate the cost review assumed when it priced
   Upstash usage. Hand-rolling against `@upstash/redis` doesn't work — it's
   a REST client with no native `SUBSCRIBE`.
2. **Mirror the existing `EventMessage` union** as a Zod schema for
   Realtime. Configure `maxDurationSecs: 300`, `history: { maxLength: 200,
   expireAfterSecs: 7200 }` — enough to replay a 2-hour tournament's
   events on reconnect.
3. **Keep an in-process Map fallback in `pubsub.ts`** for when
   `UPSTASH_*` env is unset. Pattern: `if (!process.env.UPSTASH_REDIS_URL)
   use Map<eventId, Set<Subscriber>>;`. This preserves `npm run dev`,
   `npm run lan`, and `npm run verify` for any contributor who hasn't
   provisioned Upstash. **Mark Upstash as optional-in-dev, required-in-prod
   in CLAUDE.md.**
4. **Swap `EventSource` for `useRealtime`** in `BroadcastClient.tsx`,
   `PlayClient.tsx`, `WaitForRound.tsx`. Realtime's history replay
   handles the reconnect race window that the original snapshot-on-
   reconnect plan didn't fully close.
5. **Add a 10 s polling reconcile loop to `BroadcastClient`.** `PlayClient`
   already polls every 3 s; the TV view doesn't, which means any
   lost-across-reconnect `life_changed` would show stale totals until the
   next adjustment. Cheap to fix, prevents a real user-visible bug class.
6. **Exercise the Redis path in `scripts/verify.ts`.** Either spin up an
   ephemeral Upstash DB for CI runs or default to the in-process
   fallback locally and add a separate `npm run verify:ci` that runs
   against real Upstash.

Done = correct real-time across function instances, replay on reconnect,
local dev still boots with zero cloud creds.

---

## Phase 3 — Hosting cutover (half a day, low-anxiety)

Goal: flip DNS / make the new URL the canonical one.

1. **Create the Vercel project** linked to this repo. Build cmd
   `npm run build`, output defaults are fine.
2. **Configure env on Vercel (production scope):**
   - `DATABASE_URL` — Neon connection string (HTTP driver, no pool needed).
   - `COOKIE_SECRET` — fresh 64 hex chars (rotate from current).
   - `IMAGE_GEN_URL=https://imagegen.mised.tech`
   - `IMAGEGEN_FILES_TOKEN` — same as image-gen server.
   - `BLOB_READ_WRITE_TOKEN` — auto-set by Marketplace.
   - `UPSTASH_REDIS_*` — auto-set by Marketplace.
   - `NEXT_PUBLIC_GA4_MEASUREMENT_ID` — **scope to Production only** so
     preview pageviews don't pollute the prod GA4 stream.
3. **Fix `getPublicBaseUrl`** (`src/lib/public-url.ts`):
   ```ts
   if (process.env.VERCEL) {
     const host =
       process.env.VERCEL_ENV === "production"
         ? process.env.VERCEL_PROJECT_PRODUCTION_URL
         : process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
     return `https://${host}`;
   }
   // else: existing LAN auto-detect for `npm run lan`
   ```
   Otherwise QR codes on preview deploys point at production — a real
   trap during testing.
4. **Smoke-test on a preview URL** against a Neon **branch DB** (not prod):
   create league + event, claim on phone, wizardize end-to-end (Vercel →
   imagegen tunnel → FLUX → Blob), 5+ min broadcast tab to validate
   reconnect via Realtime history, three-device cross-instance SSE
   (broadcast on laptop, phone on cellular, mutate from a third device).
5. **Pick the production domain.** Either `mtg.capxun.com` (CNAME at
   Vercel — preserves cookies, requires removing Cloudflare proxy/WAF
   config for that hostname) or a Vercel-native domain like
   `mtg-dash.vercel.app` (clean break — claimed players re-claim). Per
   the prior discussion, **clean break** is the choice.
6. **Make the cutover atomic** to avoid split-brain: stop
   `npm run tunnel:named` on the Mac *before* promoting the Vercel
   preview to production. Running both against the same Neon DB causes
   real-time fan-out to split across two pub/sub backends and confuses
   anyone caught on the old URL.

Done = `mtg-dash.vercel.app` (or whatever domain) is the canonical URL.

---

## Phase 4 — Cleanup (1 day, anytime after Phase 3)

1. **Delete `src/app/files/[file]/route.ts`** once every `avatar*Url`
   column on `players` has zero rows matching `/files/%`. Check **all five
   columns** — the original plan only mentioned `avatar_url`.
2. **Delete tunnel scripts:** `scripts/tunnel.sh`, `scripts/tunnel-named.sh`,
   `scripts/tunnel-stop.sh`, `scripts/cf-skip-waf-uploads.ts`, plus
   `tunnel`, `tunnel:named`, `tunnel:stop`, `cf:skip-waf` entries in
   `package.json`.
3. **Delete the Cloudflare WAF custom rule** (`mtg.capxun.com` is no
   longer fronted by Cloudflare).
4. **Update `README.md` and `CLAUDE.md`:**
   - Remove "Running behind a Cloudflare tunnel" and "Required env vars"
     entries for cloudflared-only stuff.
   - Add "Deploying to Vercel" pointing at this roadmap.
   - Mark `db.transaction()` as unavailable under the `neon-http` driver
     (would need a switch to the WebSocket driver).

---

## Phase 5 — Optional, future: hosted image generation

Trigger: you want to host a tournament away from the Mac, or wizard
generation latency (2.5 min) becomes a UX bottleneck.

- **Swap target:** fal.ai's [FLUX.2 [klein] 4B edit](https://fal.ai/models/fal-ai/flux-2/klein/4b/edit)
  at $0.01/MP. Same model the Mac runs — bit-for-bit similar aesthetic,
  no prompt re-tuning.
- **Cost:** ~$2.40/yr at current event cadence.
- **Effort, given Phase 0's interface refactor:** roughly half a day to
  add the fal implementation, an A/B test against a few selfies, and
  flip `IMAGE_GEN_PROVIDER=fal` in env.
- **Latency win:** ~5 s for the full 5-tier set vs current 2.5 min.

Not blocking. Not on the immediate roadmap.

---

## Phase 6 — Optional, far-future: Capacitor wrap for App Store ✅ Groundwork shipped

See [`docs/native-app.md`](native-app.md) for the build/submit path. The
Capacitor config + npm scripts live in the repo; you scaffold `ios/` and
`android/` when you're ready to start the App Store path.

Trigger: TestFlight link unblocks a player, or you want store presence
for a reason that materializes.

- **What survives the wrap:** RSC, server actions, cookie auth (with
  `SameSite=None; Secure`), `revalidatePath`, SSE, Realtime — all of it.
  Capacitor is a WebView pointing at the production URL.
- **What's new:** `@capacitor/push-notifications` plugin + a small
  `registerPushTokenAction` + an APNs/FCM sender plugged into the
  round-start / your-turn paths. Half a day each side.
- **Annual cost:** $99 Apple Developer + $25 one-time Google Play.
- **Effort:** ~3 days plus an Apple review slog (budget two weeks for
  the first submission).

Expo / React Native rewrite of `PlayClient`: don't. The benefit is small
and the maintenance burden (two codebases) is real.

---

## Cost summary

At today's volume and pattern:

| Year | Vercel Hobby | Neon free | Upstash free | Blob (Hobby) | **Total** |
|---|---|---|---|---|---|
| 1 | $0 | $0 | $0 | $0 | **$0/mo** |
| 5 | $0 | $0 | $0 | $0 | **$0/mo** |
| 10 (10× scale) | likely still $0 | possibly $19/mo | possibly $10/mo | possibly $0.20/mo | **~$30/mo** |

The single biggest cost risk is **not dollars** — it's Vercel Hobby's
"personal use only" terms. Today this is squarely a personal project
and Hobby is appropriate. If anything is ever monetized, plan to move
to Pro ($20/mo, mostly seat fee, near-zero metered usage at our scale).

---

## Risk register (consolidated from the four reviews)

| Risk | Mitigation | Where it's addressed |
|---|---|---|
| `npm run lan` / `verify` break when Upstash env unset | In-process Map fallback in `pubsub.ts` | Phase 2 step 3 |
| `after()` hits 300 s wall, leaves `wizardJobStartedAt` stuck | Inner `AbortSignal.timeout(240_000)` + concrete sweep rule | Phase 1 steps 3 & 5 |
| Reconnect race window loses events on TV broadcast | `@upstash/realtime` history replay + polling reconcile on TV | Phase 2 steps 1 & 5 |
| Blob URL drift breaks DB references | `addRandomSuffix: false` + `allowOverwrite: true` | Phase 1 step 2 |
| Preview QR codes point at production | Branch on `VERCEL_ENV` in `getPublicBaseUrl` | Phase 3 step 3 |
| Split-brain pubsub during dual-running window | Stop tunnel before Vercel promote | Phase 3 step 6 |
| Legacy `/files/<name>` rows orphan when proxy is deleted | Migration script + zero-row check across **all five** avatar columns | Phase 1 step 6 + Phase 4 step 1 |
| Hobby commercial-use ambiguity if app gets monetized | Move to Pro if/when triggered; no immediate action | "Cost summary" above |
| `db.transaction()` silently broken on Neon HTTP driver | Documented in CLAUDE.md; switch to WebSocket driver if anyone adds one | Phase 4 step 4 |

---

## Deferred concerns

### Auth / mischief (worth thinking through, not blocking)

Today the cookie scheme assumes anyone with a join token is the player
they claim to be. On a Mac-tunnelled URL where the audience is "people I
told the URL to", drive-by mischief is near-zero. Post-migration the URL
is **public and stable** — anyone who learns it can browse league pages
and (with a leaked join token) claim seats or trigger life-total
mutations.

Realistic mitigation ladder, cheapest first:

1. **Organizer-scoped server actions.** Mutations that affect *event* or
   *league* state (advance round, kick player, edit standings) require
   an organizer cookie set via a per-event organizer secret. Player-scope
   actions (adjust own life, submit own match outcome) stay open. ~1 day.
2. **Rate-limit destructive actions** via Upstash's rate-limit primitive
   on the same Redis. Cheap to add; defangs script kiddies. ~half a day.
3. **Real auth via Sign-in-with-Google** (Clerk, NextAuth, or the new
   "Sign in with Vercel"). Player identity becomes durable across
   leagues; organizer permissions become explicit. Multi-day.

Recommended trigger: implement #1 + #2 as soon as the URL goes public.
#3 only if MTG Dash ever has more than ~3 leagues active or stranger
behavior crops up.

### Verify gate against a real preview

`scripts/verify.ts` drives server actions in-process today. After
migration it'd be high-leverage to also have a mode that drives a real
Vercel preview URL end-to-end (real SSE, real `after()`, real Blob).
Catches wizard-stuck-job regressions at PR time. Not on the critical
path; nice-to-have for Phase 4+.

---

## What we explicitly are *not* doing

- **Not moving generation to a third party today.** Local FLUX is free and
  the cost-conscious choice. The Phase 0 interface refactor preserves the
  option to swap later.
- **Not building a hybrid local/cloud image-gen fallback.** Two pipelines
  doubles every prompt-tuning iteration; the gain isn't worth it until
  Mac availability becomes a real problem.
- **Not adopting Expo / React Native.** The maintenance burden is real
  and the unique unlocks are small for this app shape.
- **Not implementing a TTL / retention policy on Blob.** Free tier covers
  ~8 years at current growth. Don't pre-optimize.
- **Not keeping `mtg.capxun.com` as the canonical URL** (per the prior
  conversation — clean break preferred; existing cookies expire).
- **Not running `npm run verify` against real Upstash by default.**
  In-process fallback keeps the verify gate fast and offline-runnable.

---

## Next concrete action

Phase 0 step 1: create `src/app/manifest.ts`. Smallest possible win,
unlocks Phase 6 if it ever happens, no cloud dependencies, ~30 min of
work. Want me to write it now?
