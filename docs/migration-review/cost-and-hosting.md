# Cost & hosting recommendation — mtg-dash

> Prepared 2026-05-13 against the migration plan in `docs/vercel-migration.md`.
> Pricing rounded to the nearest dollar where helpful; cited prices were
> double-checked against vendor pages I trust were current as of late 2025 /
> early 2026, but I am not 100% sure rates haven't drifted in the last
> month — see "Pricing uncertainty" near the bottom.

## TL;DR

**Recommendation: Vercel Hobby + Neon free + Upstash free + Vercel Blob.**

For a workload that runs ~6-13 concurrent SSE streams during a 90-minute
tournament once every 1-3 months and is otherwise idle, every component sits
comfortably inside a free tier with one or two orders of magnitude of
headroom. The proposed plan in `docs/vercel-migration.md` is the right
architecture — my only adjustment is to keep it on **Hobby**, not Pro,
until something forces the move.

Expected monthly bill on the recommended stack: **$0/mo**. Realistic
worst-case (one tournament balloons to 12 players, two-hour broadcast,
plus a few unfurl pings): **$0/mo**. The single biggest risk that pushes
it to non-zero is **Vercel Hobby's commercial-use clause** — see "Hobby
commercial-use restriction" below. Cost-wise, the biggest risk is
**runaway SSE Active CPU on Pro** if you ever upgrade and forget that
each tournament holds 10+ streams open for an hour.

Estimated **annual** spend across the most realistic scenarios:

| Scenario | Annual cost |
|---|---|
| Hobby + free tiers (recommended) | **$0** |
| Pro because Hobby ToS becomes an issue | **$240** ($20/mo, mostly seat fee, almost zero usage charges) |
| Fly.io always-on small VM + Neon free | **~$24-60** (cheaper than Pro, more ops than Hobby) |
| Self-hosted Hetzner CX22 + managed Neon free + Upstash free | **~$48** ($4/mo VM) |

---

## Cost matrix — what each component actually costs at this workload

Workload assumptions (from the brief):

- **Tournament cadence:** ~6-12 per year (monthly to quarterly). Brief says "last visible tournament was May 12" so cadence is at the low end.
- **Per-tournament session:** ~90 minutes wall clock, 7-13 concurrent SSE streams, 3-5 rounds, 30-60 wizard portrait generations.
- **Outside events:** idle. Maybe tens of HTTP hits/month from unfurl bots and the occasional curious visitor.

Rough annual upper bound on real user activity:

- 12 tournaments × 90 min × 13 streams = ~234 stream-hours/year.
- 12 tournaments × 60 portraits × 5 tiers = 3,600 portrait JPEGs/year worst case (more typically ~1,800).
- 12 × 100 mutation server actions per tournament = ~1,200 mutations/year.

### Vercel (Hobby vs Pro, new Active CPU model)

Vercel's billing as of the late-2025 "managed infrastructure" model has
three primary metered axes for compute (Fluid Compute) — the legacy
"GB-seconds wall clock" model is gone:

1. **Active CPU time** — billed only when your function is actively
   executing JS. An SSE stream that's just *holding the connection
   open* and occasionally emitting a 50-byte frame burns essentially
   zero Active CPU. (This is the entire reason Fluid Compute exists.)
2. **Provisioned memory time** — billed for the wall-clock time a
   function instance is held resident, separately from CPU. Cheaper
   per GB-hour than Active CPU. Long-lived SSE *does* burn this.
3. **Invocations** — flat per-request charge in the millionths of a
   dollar.

Plus **fast data transfer** (egress) and **fast origin transfer** (between
your function and Blob/external).

Source: <https://vercel.com/docs/pricing> and
<https://vercel.com/docs/fluid-compute> (checked 2025-Q4; line items
may have been re-priced since but the *shape* of the model is stable).

#### Hobby tier (free)

Included per month (subject to change, but these are the historical
floors that have been generous for years):

- **100 GB-hours of provisioned memory** — at the default 2 GB / function
  instance, that's 50 instance-hours/month.
- **Active CPU**: a few CPU-hours free.
- **1M invocations**.
- **100 GB fast data transfer**.

Our footprint on Hobby:

- **SSE streams**: 13 streams × 1.5 h × 12 events = 234 stream-hours/year
  ≈ 20 stream-hours/month at peak season. Each stream pins a Fluid
  Compute instance for up to 300 s (5-min function duration cap on
  Hobby), then the client reconnects. The phase-2 snapshot-on-reconnect
  in the plan handles this cleanly.
- The 13 streams will *not* all pin 13 separate instances — Fluid Compute
  multiplexes long-lived connections onto the same instance. Realistic
  number of concurrent instances during a tournament: 2-4. So provisioned
  memory usage is ~3 instances × 1.5 h × 12 events = 54 instance-hours/year,
  or ~5/month at peak season. Against 50/month allowance, **roughly 10%
  utilization**.
- **Active CPU**: each SSE message is a JSON.stringify and a write to a
  stream — well under 1 ms of CPU per event. 12 events × 200 messages
  per event ≈ 2,400 CPU-ms/year. Effectively zero.
- **Invocations**: 1,200 mutation actions + 234 SSE GETs + page loads
  ≈ a few thousand/year. Free tier limit is 1,000,000/month. **Six
  orders of magnitude of headroom.**
- **Egress**: dominated by the broadcast TV page (~2 MB initial) × 12
  events = ~24 MB. Plus portrait JPEGs (handled via Blob CDN, not
  function egress). Easily under 1 GB/year.

**Hobby cost: $0/mo. Headroom: order-of-magnitude.**

#### Pro tier ($20/mo seat + metered)

Same metering, much higher included limits. At this workload Pro is
*pure seat fee* — your metered usage stays well below the $20 included
credit.

**Pro cost: $20/mo (≈$240/yr). 95% of that is the seat.**

#### Hobby commercial-use restriction

This is the non-cost reason to flag Pro.

Vercel Hobby's terms (as of late 2025) limit Hobby projects to
"personal, non-commercial" use. The grey area:

- The README and CLAUDE.md describe mtg-dash as a personal,
  friends-and-family kitchen-table app. Domain `mtg.capxun.com`. No
  monetization, no signup wall, no ads. **Squarely on the Hobby side
  of the line.**
- Vercel enforces this softly — they email and ask you to upgrade
  rather than yanking the site. The trigger is usually
  bandwidth/invocations getting into commercial-shaped patterns.
  Yours won't.
- If you ever add a paid feature, a custom-domain landing page that
  links to a Stripe checkout, or otherwise *look like a business*,
  Vercel may ask you to move to Pro. Not a sudden bill — just a
  request.

**Verdict: Hobby is appropriate. Move to Pro only if (a) Vercel asks,
(b) you want preview deploys with passwords for guests, or (c) you
want >5-minute SSE durations.**

### Neon Postgres (free tier)

Neon free as of late 2025 (Vercel Marketplace plan, which is identical
to Neon's own free plan):

- **0.5 GB storage** per project.
- **190 compute hours/month** on the default branch (one autosuspended
  instance, suspends after ~5 minutes of inactivity).
- **10 branches** total.
- Autosuspend after 5 min idle.

Source: <https://neon.tech/pricing> (was free's-storage-limit-was-3-GB
in early-2025, was tightened to 0.5 GB by mid-2025 — verify before
relying on this).

Where mtg-dash sits:

- **Storage**: schema + player rows + match rows + ELO history.
  Realistically <10 MB/year even with 50 players and hundreds of
  matches. Avatar URLs are short strings; image bytes live in Blob.
  Order of magnitude under the 0.5 GB cap.
- **Compute hours**: autosuspends 5 min after the last query. During a
  90-min tournament, the DB stays warm the whole time (1.5 h). Outside
  tournaments, the DB autosuspends almost immediately, then wakes on the
  rare unfurl crawl. Worst case: 12 tournaments × 2 h warm = 24 h/month
  at peak season. **190 h/month allowance → 12% utilization.**
- **Branches**: useful for preview-deploy DBs. Plan to use one
  permanent dev branch + ephemeral preview branches → well under 10.

**Neon cost: $0/mo. Headroom: 8× on compute, 50× on storage.**

If Neon ever tightens the free tier further, the next step up is
Neon Launch ($19/mo as of late 2025) — but Vercel Postgres / Vercel
Marketplace versions may have different pricing. Verify at upgrade time.

### Upstash Redis (cross-instance pub/sub)

Upstash free tier as of late 2025:

- **500K commands/month** (where each PUBLISH or SUBSCRIBE message
  counts as a command).
- **256 MB storage**.
- Pay-as-you-go above that at $0.20 per 100K commands (approx — check
  current rate).

Source: <https://upstash.com/pricing>.

Our pub/sub command volume:

- Per tournament: every mutation publishes one EventMessage (~7
  publish call sites in the codebase, called ~200 times during a
  5-round event). Each `publish` to Redis is 1 command.
- Each SSE consumer doesn't issue a SUBSCRIBE *per message* — it
  issues one SUBSCRIBE and then receives pushed messages over a
  long-lived TCP connection. **Pushed messages are not billed as
  commands** in Upstash's standard Redis pricing. The REST API
  bills each request, but the migration plan should use Upstash's
  native Redis protocol (or `@upstash/redis` with subscribe), not
  REST polling, for fan-out — confirm at implementation time.
- 12 events × 200 publishes = 2,400 commands/year. **Five orders
  of magnitude under the free cap.**

**Upstash cost: $0/mo. Headroom: ~200×.**

Gotcha to verify when implementing phase 2: Upstash has *two* Redis
products — the standard "Redis" (full protocol incl. SUBSCRIBE) and
"Redis REST" (HTTP-only, no native pub/sub push, must poll). The
migration plan as written assumes pub/sub-over-TCP. Make sure the
Marketplace integration provisions the right one. The plan's env
var names (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
suggest the REST product, which **does not natively support push
pub/sub**. This is a small implementation correction worth flagging
to the team — see "Open questions" #2 below.

### Vercel Blob (wizard portrait storage)

Vercel Blob pricing as of late 2025 (per <https://vercel.com/docs/storage/vercel-blob/usage-and-pricing>):

- **Hobby**: 1 GB storage + 10 GB bandwidth/month included.
- Beyond Hobby: ~$0.023/GB-month storage, ~$0.05/GB egress (rough
  — verify before committing).

Our footprint:

- Brief estimate: 10 tournaments/year × 8 players × 5 portraits × 300 KB
  = 120 MB/year. The 300 KB/JPEG figure is consistent with what
  recipe-guide reports (180 KB for 1024×768 dish photos) — wizard
  portraits at 1024×1024 will be slightly larger but in the same
  ballpark.
- **5 years of retained history = ~600 MB.** Still under the 1 GB
  Hobby cap.
- **10 years = ~1.2 GB.** Just over the cap. At that point the
  overage is ~0.2 GB × $0.023 = **less than a penny per month**.

Bandwidth:

- Broadcast TV loads each player's portrait once per session, then
  the browser caches it. 13 portraits × 300 KB × 12 events = 47 MB/year.
- Phone clients similar. Well under 100 MB/year all-in.
- Unfurl crawler hits (Slack/Twitter/Discord previews) might multiply
  this by 10× but still nowhere near the 10 GB cap.

**Blob cost: $0/mo for the foreseeable future. Even with 10 years of
retention, well under $1/mo.**

A note on Blob URL stability: the migration plan already calls this
out (Phase 1 #5 risk). DB stores the Blob URL as immutable; that's
the right call.

### Combined Vercel-stack monthly cost

| Component | Free-tier headroom at our workload | Monthly cost |
|---|---|---|
| Vercel Hobby (Fluid Compute) | ~10% of memory-hours, <0.001% of invocations | $0 |
| Neon free | ~12% of compute-hours, <2% of storage | $0 |
| Upstash Redis free | ~0.5% of commands | $0 |
| Vercel Blob (Hobby) | ~12% of storage at 1 yr, ~120% at 10 yr | $0 |
| **Total** | | **$0/mo** |

---

## Capacity ceilings — when does each free tier actually break?

Stated as "how much would we have to grow before this component costs
money":

| Resource | Free-tier limit | Our usage today | Multiplier to break |
|---|---|---|---|
| Neon storage | 0.5 GB | ~10 MB/yr | ~50× lifetime growth |
| Neon compute hours | 190 h/mo | ~24 h/mo peak | ~8× more events |
| Vercel memory-hours (Hobby) | 100 GB-h/mo | ~10 GB-h/mo peak | ~10× more events |
| Vercel invocations (Hobby) | 1M/mo | ~few thousand/yr | ~100,000× more traffic |
| Vercel egress (Hobby) | 100 GB/mo | <1 GB/mo | ~100× more traffic |
| Upstash commands | 500K/mo | ~200/mo peak | ~2,500× more events |
| Blob storage (Hobby) | 1 GB | ~120 MB/yr | ~8 years of growth |
| Blob bandwidth (Hobby) | 10 GB/mo | <100 MB/yr | ~1,000× more traffic |

**The two limits with the least headroom are Neon compute hours (8×)
and Vercel memory-hours (10×).** Both scale with how much *wall-clock
time* the system spends serving live traffic. The fastest way to hit
either is concurrent overlapping tournaments — e.g. running 4
tournaments back-to-back-to-back through a weekend would be 1-2
months of normal traffic in one day.

---

## What to do if budget is $0/mo vs $20/mo

### Budget = $0/mo (recommended)

**Stack:** Vercel Hobby + Neon free + Upstash Redis free + Vercel Blob.

**Trade-offs you accept:**

- Hobby SSE function duration is capped at ~300 s (Fluid Compute
  background tasks under Hobby may be capped at 300 s for `after()` —
  this is exactly the cliff Phase 2's snapshot-on-reconnect is built
  to absorb. Verify the current Hobby duration cap in the docs before
  going live).
- Hobby "personal use" terms (see above). Defensible for this app.
- Cold start on a sleeping Neon branch: first query after 5 min idle
  costs ~300 ms. Phones connecting to an idle event will see a
  one-time delay on first load. Within a tournament, the DB stays
  hot.
- No password-protected preview deploys (Hobby preview URLs are
  public).

### Budget = $20/mo

**Option A: stay on the same stack, just upgrade Vercel to Pro.**

- Buys you password-protected previews, longer Fluid Compute durations
  (relevant if you ever want a single SSE session to last more than
  5 min without reconnect), removes Hobby ToS ambiguity.
- Functionally indistinguishable for end users. The Phase 2
  snapshot-on-reconnect should still be implemented — it makes the
  app robust to any function recycle, on any tier.

**Option B: move to Fly.io always-on small VM.**

- `fly.io/pricing`: a `shared-cpu-1x@256mb` machine is ~$2/mo
  (or ~$5/mo for `shared-cpu-1x@512mb`). With Postgres on Fly
  (or external Neon free), full bill is ~$5-10/mo.
- Always-on means no cold start, no autosuspend. SSE streams can
  live for hours, not 5 min.
- You write a Dockerfile, manage HTTPS, manage deploys via `flyctl
  deploy`. Plan's "Cleanup" phase (kill tunnel scripts) is moot —
  you have a different ops surface.
- Worth it if the SSE reconnect cliff turns out to be annoying in
  practice, or if you want to keep the FLUX server colocated with
  the web app for free private LAN-style traffic.

**Option C: self-host on Hetzner CX22 ($4/mo).**

- ARM64 VPS, 2 vCPU / 4 GB RAM / 40 GB SSD for €3.79/mo
  (`hetzner.com/cloud`).
- You manage everything: HTTPS via Caddy/cloudflared, Postgres
  (still use Neon free externally — Postgres ops aren't worth the
  $4 savings), Node runtime, deploys via git pull or a small
  GitHub Action.
- This is essentially "the current setup but on a Linux box you
  don't have to plug into your wall." Mac-at-home → Linux-in-a-rack
  with the same tunnel-and-WAF mental model.
- Highest ops cost, lowest dollar cost.

**My pick at $20/mo: Option A. The marginal value of a Pro
subscription is overwhelmingly the ToS clarity and preview
passwords; everything else stays the same.**

---

## Alternatives — ballpark monthly cost at this workload

| Platform | Monthly cost | Pros | Cons | Fit |
|---|---|---|---|---|
| **Vercel Hobby + Neon free + Upstash free + Blob** | **$0** | Zero ops, hot reload via preview deploys, FLUX stays at home, plan already written | Hobby ToS grey-area, 5-min SSE reconnects, Hobby preview URLs public | **Recommended** |
| Vercel Pro + same | $20 | Same as above + preview auth + longer SSE durations + ToS clear | $20/mo is mostly a seat fee for this workload | Good if you want zero ambiguity |
| Fly.io 256 MB VM + Neon free + Upstash free + Cloudflare R2 | $2-5 | Always-on, no SSE cliff, single binary deploy, region-pinned latency | Dockerfile + flyctl, you provision HTTPS, no preview deploys without extra plumbing | Good if SSE reliability matters more than ops convenience |
| Render free Web Service + Neon free + Upstash free | $0 nominally | Familiar Heroku-style deploys | Free tier sleeps after 15 min idle, **30-60 s cold start on wake** — terrible for "phones scan QR at start of tournament" | **Bad fit** — cold start punishes the kickoff moment |
| Render Starter + Neon free + Upstash free | $7/mo | No cold starts, postgres add-on optional | Still need external Redis + Blob equivalent | Reasonable, slightly worse than Fly |
| Railway | ~$5-10/mo | Excellent DX, integrated Postgres, simple deploy | Their free tier was deprecated in 2023; minimum spend is now $5/mo Hobby or $20/mo Pro | Reasonable if you specifically like Railway's UX |
| Cloudflare Workers + Pages + R2 + D1 (OpenNext) | $0-5 | Free tier is genuinely generous, global edge, R2 has free egress | Next.js 16 + Workers via OpenNext is bleeding-edge; SSE on Workers is constrained (request duration limits, no traditional long-lived connections without Durable Objects); your stack uses Drizzle + Neon, swapping to D1 is a meaningful rewrite | **Bad fit** — porting cost dwarfs the savings |
| Self-hosted Hetzner CX22 + Neon free + Upstash free | ~$4 | Cheapest non-zero option, full control, FLUX *can* run on this if you ever want to move it off the Mac | You're back to ops (HTTPS, restarts, OS upgrades), security patching | Good only if you actively want the ops |
| DigitalOcean droplet | ~$6 | Same as Hetzner but pricier | Same as Hetzner | Worse than Hetzner |

---

## Pricing uncertainty

I'm operating with a January 2026 knowledge cutoff and this analysis
was written in May 2026 — there's a real chance some line items have
moved by single-digit percentages or that one of the free-tier limits
has been tightened. The shape of the verdict (every component sits
inside its free tier with order-of-magnitude headroom) is robust to
moderate price changes. Worth re-checking before deploy:

1. Neon free storage cap — was 3 GB in 2024, 0.5 GB by late 2025.
2. Upstash command pricing and free-tier ceiling.
3. Vercel Blob's free bandwidth and storage allotment on Hobby.
4. The exact Fluid Compute / Active CPU unit pricing — the *model*
   (cheap-when-idle SSE) is stable; the *rates* shift quarterly.
5. Whether Hobby's function-duration cap is still 60-300 s or has
   converged on a single number across Fluid Compute / serverless.

---

## Open questions for the implementer

1. **Upstash product flavor.** Plan's env var names (`UPSTASH_REDIS_REST_URL`)
   suggest the REST API product, but the Phase 2 design ("lazily opens a
   Redis subscriber for the channel … on last unsubscribe, close the
   Redis subscriber") requires native Redis pub/sub over TCP. Confirm
   the Marketplace integration provisions the right product before
   wiring up `subscribe()`. The REST API only supports request/response
   — it cannot maintain a push channel.

2. **Function instance affinity for SSE.** Even after introducing Redis
   pub/sub, each SSE consumer still needs *one* TCP subscriber per
   eventId per function instance, refcounted. If Fluid Compute decides
   to scale up a second instance mid-tournament, the second instance
   has to lazily SUBSCRIBE on first consumer demand. Plan covers this
   ("one subscriber per function instance per eventId") but worth
   re-checking that the refcount + close-on-zero logic is exercised in
   `npm run verify` against a real Upstash channel before relying on it.

3. **Blob retention policy.** Brief mentions "the user may want years
   of history retained for unfurls". Confirm: do you want a sweep job
   that deletes wizard portraits for players who haven't appeared in
   an event in N years? Or keep everything forever (cost stays trivial
   for ~8 years before tipping over the 1 GB Hobby Blob cap)? My
   recommendation: keep forever, set a calendar reminder for 2034 to
   re-evaluate.

4. **Active CPU billing on `after()`.** The Phase 1 plan wraps the
   2.5-min FLUX call in `after(async () => …)`. On Vercel Hobby,
   `after()` work is billed against Active CPU + memory like the
   parent function, but is allowed to outlive the response. The FLUX
   call itself is mostly *waiting on a network response* from
   imagegen.mised.tech, which means actual CPU on Vercel's side is
   near-zero. **Memory time is what gets billed**, and at ~2.5 min ×
   2 GB ≈ 0.08 GB-h per portrait × 60 portraits = 5 GB-h per
   tournament × 12 events = 60 GB-h/year. Adds ~5 GB-h/month at peak
   season on top of the SSE memory time. Still well under the 100
   GB-h Hobby cap, but worth knowing — this is now the *second
   largest* memory consumer in the system after SSE.

5. **`getPublicBaseUrl` on Vercel.** Plan's step 13 uses
   `VERCEL_PROJECT_PRODUCTION_URL`. That's correct for the production
   deploy, but preview deploys want `VERCEL_URL` (or `VERCEL_BRANCH_URL`)
   instead — otherwise QR codes generated on a preview point at prod.
   Minor.

---

## Conclusion

The migration plan as written is well-sized for the workload. **Run it
on Hobby.** Don't pay $20/mo unless and until something concrete forces
the move — most likely (a) Vercel asking you to upgrade for ToS reasons
(unlikely at this scale and pattern), or (b) you decide you want longer
SSE durations without client reconnects. Neither is on today's
roadmap.

The architecture's biggest *technical* fragility is the SSE
function-duration cliff at 300 s, not its cost. The plan's
snapshot-on-reconnect already addresses it; just make sure that path
is exercised in `npm run verify`.
