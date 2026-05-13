# Iteration speed & architecture review — Vercel migration

> Prepared 2026-05-13 against `docs/vercel-migration.md`.
> Cross-checked against current (May 2026) Vercel and Upstash docs via ctx7.
> Reference repo for the `IMAGE_GEN_URL` pattern: `~/Programs/recipe-guide`.

## TL;DR

The migration plan's **direction is right** — moving the public surface to
Vercel solves the "Mac asleep, the site is dark" problem without giving up
the LAN dev loop. But the plan has **three soft spots worth fixing before
flipping the switch**:

1. **The Redis pub/sub design names a model that doesn't exist on Upstash's
   serverless API.** The plan says "one Redis subscriber per function
   instance per eventId, refcounted." `@upstash/redis` is REST/HTTP and
   cannot hold a long-lived `SUBSCRIBE` connection — there's no client
   socket to refcount. The transport you actually get is **Upstash's
   `POST /subscribe/{channel}` SSE endpoint**, which is itself a long-lived
   HTTP stream the SSE route would proxy. That changes the
   refcount/cleanup design and adds a hop. **`@upstash/realtime` is a
   first-party SDK that already solves this exact shape** (Redis Streams +
   SSE + Next.js + Vercel, with replay/history) and is the right
   off-the-shelf substrate. Recommend adopting it instead of hand-rolling.
2. **The snapshot-on-reconnect frame is necessary but not sufficient.** It
   handles client-noticed disconnects fine, but there's a 50–200 ms
   reconnect window where a `life_changed` published mid-reconnect can be
   lost on the broadcast view (which has no polling fallback — only `/play`
   polls). Fix: include a server-side **sequence number / watermark** on
   every event, snapshot frame stamps the latest seen seq, client replays
   with `Last-Event-ID` so the new stream backfills. `@upstash/realtime`'s
   history feature does this out of the box.
3. **`after()` + the 2.5-min FLUX call has thin headroom on Hobby and zero
   crash-recovery.** Hobby's max function duration is 300 s (the same 300 s
   the SSE plan also uses). A 150 s FLUX gen leaves ~150 s for everything
   else — fine, but **if `after()` exceeds the budget, the function is
   killed and `wizard_job_started_at` stays set forever.** The plan
   mentions a stale-job sweep "on next page load" but doesn't specify
   *which* page, *what condition*, or *whether the sweep also clears the
   stale_at column so it doesn't fire twice*. Needs a concrete rule.

Below: dev-loop comparison, then each concern in priority order with a
proposed fix, then hardening recommendations.

---

## 1. Dev loops post-migration

| Loop | Today | Post-migration | Verdict |
|---|---|---|---|
| `npm run dev` | `next dev` → localhost:3000, HMR, single dev DB | **Unchanged.** Hits Neon over HTTP (same driver). FLUX still at `127.0.0.1:8000`. | ✅ Same |
| `npm run lan` | `next build && next start -H 0.0.0.0 -p 3002`, QR with LAN IP, no HMR | **Unchanged** — the script doesn't touch Vercel at all. **But:** the production-build path now imports `@upstash/redis` and a Blob client. If `UPSTASH_*` env is unset, `subscribe()`/`publish()` will throw at runtime. Plan must include a **"no-Redis fallback to in-process Map"** path or `npm run lan` will break for any dev who doesn't have Upstash creds. | ⚠️ Needs guard — see Concern #4 |
| `npm run tunnel:named` | Stable HTTPS at `mtg.capxun.com`, prod build, ~10 s after `Ctrl-C` | **Gone** (and the plan says good riddance). Replaced by Vercel preview URLs. | Removed by design |
| "Test this PR on my phone" — Vercel preview deploys | n/a today | `git push` → ~60–120 s build → preview URL (no propagation delay, no edge cache for dynamic routes) → scan QR / paste. Stable URL per commit. | **Slower than `tunnel:named` for in-the-moment hot-reload iteration (60–120 s vs ~2 s file save), faster than `tunnel:named` for "share with someone else"** because no Mac dependency. |
| "Show someone else over the internet" | `tunnel:named` if Mac is awake, otherwise dead | Always-on production URL + per-branch previews. | ✅ Strictly better |
| Edit a server-action and test on a phone | Save file → wait ~2 s for `next dev` HMR → reload on phone (over LAN) | Same via `npm run dev` against a phone on Wi-Fi, **as long as the dev's laptop and the phone are on the same network and Redis env isn't required.** Else: `git push` → 60–120 s preview build. | Effectively unchanged if you set up #4 |

**Verdict on "will Vercel box us in?"**: No, *as long as the migration
preserves a Redis-less path for `npm run dev` / `npm run lan`*. The plan
currently doesn't say it does. Without that, every dev loop suddenly
requires three pieces of cloud infra to be configured before the app
boots — which is a real iteration-speed regression even though
`npm run dev` "still exists."

---

## 2. Architectural concerns (priority order)

### Concern A — Redis pub/sub design uses the wrong primitive (HIGH)

**The plan says:**
> `subscribe(eventId, cb)` lazily opens a Redis subscriber for the channel
> (one subscriber per function instance per eventId, refcounted across
> local subscribers), dispatches messages to local callbacks. On last
> unsubscribe, close the Redis subscriber.

**The problem:**
`@upstash/redis` is a **REST/HTTP client**, not an ioredis-style TCP
client. It does not expose a long-lived `SUBSCRIBE` API the way the plan
implies. Per Upstash's docs:

> The REST API is suitable for environments that do not support TCP
> connections … It is also beneficial for serverless functions as it is
> request-based and does not require managing persistent connections,
> unlike the Redis protocol.

The way you actually subscribe via Upstash from serverless is to **POST
to `/subscribe/{channel}` with `Accept: text/event-stream`**, which gives
you back a chunked HTTP stream of SSE-framed messages from Upstash itself.
The Vercel function then has to **proxy that SSE stream to the browser**,
re-framing as it goes (or pass through). There is no in-instance refcount
to share between local subscribers because each subscriber needs its own
upstream HTTP request unless you fan out manually.

Two consequences the plan doesn't address:
- The "refcounted local subscriber set" buys you very little, because the
  scarce resource isn't a TCP socket — it's the upstream Upstash HTTP
  stream, and that stream is **tied to the lifetime of the function
  invocation that opened it**. If a second event subscriber on the same
  instance wants to share it, you need an in-memory bus *plus* a single
  long-poll loop that reads from the upstream and dispatches locally.
  Doable, but more than the plan describes.
- **Both ends of the SSE chain (Upstash → Vercel function → browser) are
  subject to the same 300 s function-duration cliff.** When the Vercel
  function dies at 300 s, the upstream Upstash HTTP stream is abandoned
  *and* the browser reconnect happens. Two timeouts to manage, not one.

**Proposed fix:**
Adopt **`@upstash/realtime`** (`/upstash/realtime` on ctx7, first-party).
It is built for exactly this scenario:
- Server-side: a typed `Realtime` instance backed by Redis Streams (not
  pub/sub — Streams give you replay), schema-validated with Zod, with
  `maxDurationSecs: 300` baked in for Vercel.
- Client-side: a `useRealtime` hook with built-in reconnect handling and
  per-channel history replay.
- History is configurable (`history: { maxLength: 1000, expireAfterSecs:
  86400 }`) — replays missed events on reconnect using each client's
  last-seen offset. **This is exactly the watermark mechanism Concern B
  needs**, supplied by the library.

If for some reason `@upstash/realtime` is rejected (e.g. wanting to keep
the EventMessage union and EventSource pattern untouched), the plan
should at least:
- Acknowledge that `subscribe()` is really "open a long-lived HTTPS
  request to Upstash's `/subscribe/{channel}` and forward."
- Specify what happens on **upstream disconnect mid-stream** (Upstash's
  SSE endpoint also drops idle connections).
- Specify the in-instance fan-out (one upstream request per channel per
  instance, with a Map of local subscribers).

### Concern B — Snapshot-on-reconnect has a race window (HIGH)

**The plan says:**
> On connect, before subscribing, send a snapshot frame … Add `type:
> 'snapshot'` to the EventMessage union. … This is how we tolerate the
> 300s function-duration cliff: client auto-reconnects → server sends
> fresh snapshot → no missed-event drift.

**The gap:**

Timeline of a function-duration kill, in order:
1. `t = 300 s`: Vercel terminates the SSE function. Browser's EventSource
   sees an EOF.
2. `t = 300 s + ~50 ms`: EventSource issues the auto-reconnect GET.
3. `t = 300 s + ~150 ms`: New function instance accepts the request,
   begins building the snapshot (DB query for round + matches +
   standings).
4. `t = 300 s + ~250 ms`: Snapshot sent. Then `subscribe()` runs.
5. Subsequent live events arrive.

Now imagine a `life_changed` event published between steps 3 and 4. The
DB write happened *after* the snapshot's read but *before* the new
subscription is wired up. The client never sees it. SSE delivery is
best-effort by definition and the plan accepts that, **but the broadcast
view has no polling fallback** — only `/play` does. So the broadcast TV
shows stale life totals for a `life_changed` lost across a 5-minute
reconnect cliff. Not the end of the world (it gets fixed the next time
*anyone* on that match adjusts life), but it's a real user-visible
regression vs today's in-process model where the publisher and subscriber
share memory.

A related issue: **the snapshot has to be derived from the same DB query
the broadcast page already uses.** Today, those queries return ~10
columns per match plus avatar tiers — that's 5–15 KB of JSON per round.
Sending it on every reconnect, every 5 minutes, multiplied by 10
phones + 1 broadcast = ~150 KB extra per phone every hour. Negligible in
isolation, but worth not pretending it's free.

**Proposed fix:**

Option 1 (clean): adopt `@upstash/realtime`. Its history feature is the
watermark mechanism — clients get replay via offsets, not snapshots, and
the race window collapses to "you might see a duplicate, which is
idempotent for `life_changed` because we always send absolute life
totals, not deltas."

Option 2 (if hand-rolling): add a monotonic per-event `seq` column on a
new `event_messages` table or use `INSERT ... RETURNING xmin` /
`pg_current_snapshot()`. Snapshot stamps the latest seq it saw. SSE
route accepts `Last-Event-ID` (the seq the client last saw), reads
`event_messages WHERE event_id = ? AND seq > ?`, replays them, *then*
subscribes. This is also a watermark — closes the race exactly because
the DB read inside the new instance is monotonic with the publish that
inserted the row.

Either way, **the plan as written ("client auto-reconnects → server sends
fresh snapshot → no missed-event drift") is overconfident.** Drift is
possible in a small window, and the broadcast view has no polling
backstop.

### Concern C — `after()` budget is tight, recovery is hand-wavy (HIGH for Hobby)

**The plan says:**
> Wrap the fire-and-forget 2.5-min FLUX block in `after(async () => {…})`
> from `next/server`. Keeps the <1s response, lets the long work run
> inside the 300s function budget.

**The numbers (current Vercel docs, ctx7-fetched May 2026):**
- **Hobby: max duration 300 s** (default 300 s, can't configure higher).
- **Pro/Enterprise: max duration 800 s** (default 300 s, configurable
  upward) — both with Fluid Compute enabled, which is now the default
  for new projects.

`after()` work runs inside the same function budget as the response that
scheduled it (this is the "Fluid Compute background processing" model,
shared with `waitUntil`). So:
- **Headroom on Hobby**: 300 s − 2 s (action response) − 150 s
  (5-tier FLUX gen, observed) − ~5 s (Blob uploads + DB writes) = **~143 s
  slack**. Comfortable on a happy day; **gone** if the Mac's FLUX server
  is responding slowly (it sometimes takes 30–40 s/tier in practice → 200
  s for five) or if there's a Cloudflare tunnel hiccup mid-gen.
- **Headroom on Pro**: 800 s − same → 642 s slack. Plenty.

**The recovery story is the bigger issue.** If `after()` hits the
deadline:
- The function is **terminated**. Per Vercel docs, "background tasks
  scheduled with `waitUntil`/`after()` run until the function suspends or
  is terminated; reaching the duration limit terminates them."
- Pending DB writes inside the `try` block are lost (the `await db.update`
  that clears `wizardJobStartedAt` and writes the avatar URLs never
  runs).
- `wizardJobStartedAt` stays set. The `/players/[id]` page polls
  `router.refresh()` every 4 s expecting it to clear. It never does.
  **User sees a spinner forever.**

Plan's stated mitigation:
> Add a stale-job sweep: if `started_at` is older than ~5 min and the
> avatar URLs haven't changed, clear it on next page load.

What's underspecified:
- *Which* page load? Any visit to `/players/[id]`? Or a server-side
  middleware? If it's only when a player visits their own page, an
  organizer trying to start round 1 might find one player stuck without
  knowing why.
- *How* does it clear? Set `wizardJobStartedAt = null` only? Or also flag
  the row as "last gen failed" so the UI can show a retry CTA instead of
  silently dropping the spinner?
- What if the page check fires *while a healthy 290 s gen is still in
  progress*? You'd wipe the in-progress flag, and then 10 s later
  `after()` would write `avatar*Url` columns to a row whose flag was
  cleared — looks fine actually, but it'd be nice if the sweep checked
  for active work some other way.

**Proposed fix:**
1. Set a hard timeout *inside* the `after()` block so it gives up cleanly
   on its own at ~250 s rather than being killed cold at 300 s. Use
   `AbortSignal.timeout(240_000)` on each FLUX `fetch`. (Recipe-guide's
   `backfillCandidateDishPhotos` already does this with
   `AbortSignal.timeout(180_000)` per call — same pattern.)
2. Define the sweep concretely:
   - Run from a **server-side helper** called by *both* the `/players/[id]`
     page and `/events/[id]/manage` (any page that lists a player whose
     job might be stuck).
   - Clear `wizardJobStartedAt` if `> 6 min` ago AND `avatarUrl IS NULL`
     (the start of the action blanked it; if `after()` succeeded it
     would be non-null again).
   - Surface a "Generation failed — try again" UI banner on the player
     page when this happens.
3. Add to `scripts/verify.ts`: force-kill a wizardize mid-flight (e.g.
   set the column with a long-ago timestamp via raw SQL) and assert the
   sweep clears it within one page load.

### Concern D — `npm run lan` will break without Redis env (MEDIUM)

The plan rewrites `src/lib/pubsub.ts` to use Upstash. If a dev cloned
fresh and ran `npm install && npm run dev` without provisioning Upstash
first, **every server action that calls `publish()` would throw and
every SSE stream would 500**. That breaks `npm run lan` for any host
machine that doesn't have `UPSTASH_REDIS_REST_URL` set — including the
LAN-demo path that the plan claims will be unaffected.

**Proposed fix:**
- Keep the in-process `Map<eventId, Set<Subscriber>>` as the **fallback**
  when `process.env.UPSTASH_REDIS_REST_URL` is unset. Behavior matches
  today's single-machine model; SSE works locally; tests work locally.
- The Redis pubsub kicks in only when the env is set. This is the same
  pattern recipe-guide uses for `IMAGE_GEN_URL`: feature-detect, no-op
  cleanly without the optional dependency.
- The CLAUDE.md "Required env vars" section should mark Upstash as
  **optional in dev, required for cross-instance fan-out in production.**

### Concern E — `verify` script & Redis (MEDIUM)

**Today:** verify imports server actions from `src/app/events/actions.ts`
and calls them directly. Those actions call `publish()`. With the
in-process Map, `publish()` is a no-op when nobody is subscribed — fine.

**Post-migration:** if `publish()` becomes "POST to Upstash REST API",
the verify script either needs a real Upstash to point at *or* the
in-process fallback above. The plan does not address this.

**Proposed fix:**
- The fallback in Concern D solves this for free: verify runs without
  `UPSTASH_REDIS_REST_URL`, falls back to in-process, publish is a
  no-op. The verify gate stays under 10 s without FLUX.
- If you want to actually exercise the Redis path under verify, add a
  separate `npm run verify:ci` that runs against a 72-hour ephemeral
  Upstash DB (`https://upstash.com/start-redis` returns one).

### Concern F — Cookie / domain churn during the transition (MEDIUM)

The plan calls for a clean-break domain and accepts that existing
`mtg.capxun.com` claimed players will need to re-claim. Reasonable.

**The gap the plan doesn't address:** during the **dual-running window**
(the day or two after the Vercel deploy goes live but before the user
flips DNS / tells everyone to use the new URL), Andrew personally has
**two installations live**: the old Mac-tunnelled `mtg.capxun.com` and
the new Vercel URL. They share **the same Neon DB** by default unless
the plan provisions a separate one.

That creates a foot-gun: a player who claims a seat on the new URL,
then later happens to revisit `mtg.capxun.com` (it's still up because
the Mac hasn't been turned off yet), will be **logged out** (cookies
scoped to the new domain don't apply) but **the DB row still has their
`event_players` claim with a new `join_token`**. They'll see "Continue
as X" for nobody, and the per-event claim cookie from the old domain is
stale.

Worse: **the old Mac install's in-process pubsub continues to publish
events to phones still pointed at `mtg.capxun.com`**, while the new
Vercel install's Upstash pubsub publishes events to phones pointed at
the new URL. Two phones on the same tournament could be on opposite
sides of a split-brain real-time view until everyone migrates.

**Proposed fix:**
- During the transition, **point the Mac install at a read-only Neon
  branch** (or just turn it off — `npm run tunnel:stop` is one command).
  Don't try to dual-run against the same primary DB.
- Or, make the cutover atomic: stop `tunnel:named`, then `vercel
  promote`. The two installs are never live simultaneously.
- Add a one-time `cleanupStaleClaimsAction` that nulls
  `event_players.join_token` for any active event before the cutover
  if the dual-running plan stays.

### Concern G — Broadcast view has no polling fallback for the broadcast TV (MEDIUM)

This isn't introduced by the migration — it's a pre-existing soft spot
that the migration **amplifies**. Today, the in-process pubsub is
effectively lossless because publisher and subscriber share memory.
After Redis pub/sub + 300 s reconnect cliffs, lost events become
possible (see Concern B). `PlayClient.tsx` has a 3 s polling reconcile
loop that hides this from phones. **`BroadcastClient.tsx` does not** —
the TV view is pure SSE.

So a missed `life_changed` between snapshot and subscribe shows up as a
stale life total on the TV until either someone adjusts life again
(triggering a fresh `life_changed`) or the page is manually refreshed.
The current code path even comments this:

```tsx
} else if (
  msg.type === "match_complete" ||
  msg.type === "game_complete" ||
  msg.type === "round_started" ||
  msg.type === "round_completed"
) {
  // Hard refresh — server has the source of truth.
  window.location.reload();
}
```

— good defensiveness for the structural events, but life totals slip
through.

**Proposed fix:**
- Add a 10 s polling reconcile loop to `BroadcastClient` (it's a TV view
  — the polling overhead is invisible, and 10 s drift is fine for the
  audience but not for the players, so use 3 s on phones and 10 s on
  TV).
- Snapshot frame from the SSE route can double as the polled state by
  reusing the same query.

### Concern H — Subtle: `getPublicBaseUrl` returns the wrong host on previews (LOW, but `cost-and-hosting.md` already flagged this)

The plan says:
> If `process.env.VERCEL`: return
> `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`

`VERCEL_PROJECT_PRODUCTION_URL` is the **production** URL. On a preview
deploy, this means the QR code Andrew shows from his preview points
guests at production. The companion `cost-and-hosting.md` doc already
flagged this — fold the fix in:

```ts
if (process.env.VERCEL) {
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  return `https://${host}`;
}
```

### Concern I — Neon driver: `neon-http` vs the pooled URL (LOW)

The plan says use the **pooled connection string** for `DATABASE_URL`
and call Drizzle's PgBouncer-compatible path. **But** the codebase uses
`@neondatabase/serverless`'s **HTTP driver** (`neon(url)` →
`drizzle(sql)`), not the WebSocket / `Pool` driver. Neon's HTTP endpoint
is already serverless-tuned and *ignores* the `?pgbouncer=true` parameter
the way a TCP pool would care about it — the connection isn't pooled
across function invocations because each query is a fresh HTTPS request.

This isn't broken — the HTTP driver is great for Vercel — but it means:
- The plan's note about PgBouncer / pooled URL is somewhat misleading.
  Just use the regular Neon connection string.
- `attachDatabasePool()` from `@vercel/functions` (the standard
  "release-idle-clients-before-suspend" Fluid Compute helper) **does
  not apply** because there's no pool. That's fine, just don't follow
  templated guides that assume `pg.Pool`.
- The HTTP driver doesn't support transactions across statements (each
  `db.something()` call is one HTTP roundtrip). Today's actions.ts is
  fine because every action runs sequential updates without wrapping
  them in `db.transaction()`. **If anyone in the future adds a `db.transaction`,
  it'll silently degrade or throw.** Worth noting in CLAUDE.md.

### Concern J — Concurrent instances and the "Fluid Compute reuses instances" assumption (LOW)

The current `pubsub.ts` comment says:
> Fluid Compute reuses function instances, so a single host running a
> single tournament will land on the same instance for both producers
> (mutations) and consumers (SSE streams). If we ever need
> cross-instance fan-out, swap for Redis pub/sub or Vercel Queues.

This is **true** of Fluid Compute's "optimized concurrency" model
*when load is light*, but Vercel doesn't guarantee it. Per docs: "Fluid
compute uses optimized concurrency to route multiple requests to the
same instance based on load and availability." For 6–13 concurrent SSE
streams that each hold a function for 5 minutes, **the routing decision
is per-request and not affinitized to a specific instance**. A
`adjustLifeAction` call from a phone could land on instance A while
the broadcast SSE is held open on instance B — and today's in-process
Map would never propagate. That's the whole reason the plan adds
Upstash. Good.

But it means: **between "deploy in-process pubsub to Vercel" and
"finish wiring up Upstash" — even briefly — the real-time view is
broken**. The plan should do Phase 2 (cross-instance pub/sub) **before**
Phase 3 (hosting cutover), not after. Reading the doc again carefully,
Phase 2 *is* listed before Phase 3 numerically, but step 14 says "First
deploy goes to a Vercel preview URL" — and the smoke-test at step 14
includes "Round-by-round SSE on both broadcast + phone (cross-instance
pub/sub test)." So the *first ever* Vercel deploy is already supposed
to have Upstash wired up. Confirming this is the intent would be good
to make explicit.

---

## 3. Hardening recommendations for `docs/vercel-migration.md`

In priority order, the deltas I'd make:

1. **Replace step 8** (the hand-rolled `subscribe` rewrite) with: "Adopt
   `@upstash/realtime` as the SSE substrate. Define the event schema
   with Zod, mirror the existing `EventMessage` union. Use
   `maxDurationSecs: 300`. Configure history (`maxLength: 200`,
   `expireAfterSecs: 7200`) so a 2-hour tournament's worth of events
   replay on reconnect. Replace `EventSource` in `BroadcastClient`,
   `PlayClient`, `WaitForRound` with the `useRealtime` hook."
2. **Replace step 9** ("Add `type: 'snapshot'` to the EventMessage
   union") with: "`@upstash/realtime`'s history replay handles
   reconnect drift. Drop the snapshot frame. If hand-rolling, add a
   monotonic `seq` to every event message and accept `Last-Event-ID`."
3. **Modify step 8 / pubsub rewrite** to keep the in-process Map as the
   fallback when `UPSTASH_REDIS_REST_URL` is unset, so `npm run dev`,
   `npm run lan`, and `npm run verify` keep working without Upstash
   creds.
4. **Add to the wizard `after()` section** (currently in Risks at the
   bottom):
   - Inner timeout (`AbortSignal.timeout(240_000)`) on each FLUX
     fetch.
   - Concrete sweep rule: server-side helper called from
     `/players/[id]` *and* `/events/[id]/manage` page renders, clears
     `wizardJobStartedAt` if older than 6 min AND `avatarUrl IS NULL`,
     surfaces a retry banner.
   - Add this to `scripts/verify.ts` (force a stale row, assert the
     sweep clears it).
5. **Fix step 13** (`getPublicBaseUrl`): use `VERCEL_ENV` to pick
   between `VERCEL_PROJECT_PRODUCTION_URL` (prod) and `VERCEL_BRANCH_URL` /
   `VERCEL_URL` (preview). Otherwise QR codes on preview deploys point
   at production.
6. **Add to `BroadcastClient.tsx`** a 10 s polling reconcile loop
   mirroring `/play`'s. Without it, missed life-total events stay
   missed on the TV until something else fires.
7. **Step 11 (Neon)**: Drop the "pooled vs unpooled" wording — clarify
   that with `neon-http` there is no client-side pool to manage. Just
   use the standard connection string. Note that
   `db.transaction(...)` doesn't work over the HTTP driver and would
   need a switch to `@neondatabase/serverless`'s pool/WebSocket driver
   if any future action needs it.
8. **Add a "transition window" section**: turn off `tunnel:named`
   *before* the first guest visits the Vercel URL, to avoid
   split-brain pubsub across two installs sharing a DB.

---

## 4. Open questions

- **Pro plan trade?** `cost-and-hosting.md` already recommends Hobby.
  But Concern C's headroom math gets considerably more comfortable on
  Pro (800 s vs 300 s function duration → `after()` can survive a
  flaky FLUX run). If Hobby's tightness ever bites in practice, that's
  the upgrade trigger. Worth naming explicitly as a fallback ladder.
- **Verify gate end-to-end on Vercel?** `scripts/verify.ts` is a great
  unit-of-truth for "did I break a server action." It currently runs
  against the local DB and never against a deployed Vercel function.
  Should it also be runnable against a preview URL (driving real HTTPS
  + real SSE + real `after()`)? That would catch the wizard-stuck-job
  regression at PR time instead of in production. Not blocking, but
  high-leverage.
- **What about the wizard-portrait gallery view during the migration
  window?** `players.avatar*Url` will be a mix of `/files/<name>` paths
  (legacy) and `https://blob.vercel-storage.com/...` (new). The
  proxy route at `src/app/files/[file]/route.ts` still has to work
  until **every** row is migrated, not just most. Step 18 says delete
  the route once `count(*) FROM players WHERE avatar_url LIKE '/files/%'`
  returns zero — but `avatar*Url` covers five columns. The check needs
  to include all five.
- **GA4 measurement ID on previews?** Plan sets
  `NEXT_PUBLIC_GA4_MEASUREMENT_ID` in production env. Preview deploys
  will inherit it by default (Vercel env vars default to all
  environments unless scoped). Do you want preview pageviews polluting
  the prod GA4 stream? Probably scope it to Production only on Vercel.

---

## 5. What the plan gets right (so the deltas above don't drown it out)

- The architectural shape (Vercel + Neon Marketplace + Blob + Upstash
  for cross-instance fan-out + outbound tunnel for FLUX) is the right
  shape. The recipe-guide repo is precedent for the
  `IMAGE_GEN_URL`-tunnel pattern and it works there.
- Phase ordering (Blob → Pub/sub → Hosting cutover → Cleanup) is correct.
  Blob migration is reversible up to the last delete, and the in-process
  pubsub keeps working on the Mac install until the cutover.
- Clean-break domain + accepting cookie loss is the right call. The
  alternative (CNAME the existing domain at Vercel) creates ambiguity
  about which install is canonical during the transition.
- Keeping `npm run dev` and `npm run lan` untouched is the **single
  most important iteration-speed preservation move**, provided the
  Concern D fallback lands.
- The plan correctly identifies the wizard stale-job issue (Concern C)
  and the Neon connection-ceiling issue (Concern I) in its Risks
  section — the fixes need more specificity than the Risks section
  currently has, but the problems are named.
