# Images & storage — migration review

Scope: how do we generate the 5-tier wizard portraits, and where do we keep
them once we're hosted on Vercel? Reviewed against the user's two questions:

1. "Local generation is cheap and plentiful, cloud storage might get
   expensive." — true or false?
2. "Can we use a cheap third-party for generation instead of the Mac?"

Spoiler: storage is so cheap at our scale it's a rounding error. Generation
is the real cost driver, and even there the numbers are smaller than the
user's instinct suggests.

---

## TL;DR

- **Storage at our scale is free.** ~120 MB/yr of JPEGs is rounding error
  on every option we considered. Vercel Blob's Hobby tier (1 GB storage +
  10 GB transfer/mo) absorbs us for free for the foreseeable future. The
  user's intuition that "cloud storage gets expensive" is wrong **at this
  volume** — we'd have to grow 50× before storage costs anything anywhere.
- **Generation is the real cost decision.** A full event (8 players × 5
  tiers = 40 portraits) costs **$0 + ~20 min of Mac wall time** locally vs
  **~$0.40–$1.60** on a hosted FLUX-family API depending on the model. At
  6 events/yr that's **$2.40–$10/yr** for cloud generation — also a
  rounding error.
- **fal.ai hosts FLUX.2 [klein] at $0.01/MP** — literally the same model
  the Mac is running. ~$0.01 per 1024² portrait. **$0.40/event, $2.40/yr.**
  This is the cleanest "Mac independence" upgrade if we want it.
- **Recommended: Architecture A** (local FLUX + Vercel Blob), exactly as
  the existing `vercel-migration.md` plan describes. Mac stays the
  generation engine, Vercel Blob holds the outputs so the site serves
  portraits when the Mac is asleep. Adding a `fal.ai` fallback later is a
  one-screen code change if we ever want it — design for it but don't
  build it yet.
- **Lifecycle/TTL is unnecessary.** Storage is so cheap that retention
  policies cost more in code complexity than they save. Don't bother
  deleting old portraits; let the Hobby plan ceiling be the natural cap.
- **Biggest risk: Vercel Blob URL stability.** Once a URL is in `players.
  avatar*Url`, it's effectively immutable — we must not run a script that
  deletes and recreates blobs, because the URL changes and the DB row
  goes stale. The migration-plan doc already calls this out; the
  recommendation here is to keep `addRandomSuffix: false` and
  `allowOverwrite: true` so the same `players/<id>/<tier>.jpg` key gets
  overwritten on regenerate.

---

## Image-gen cost matrix

All prices below are img2img / edit modes — what wizardize actually does.
Plain txt2img is cheaper everywhere but wouldn't preserve the player's
face, which is the whole point.

| Provider | Closest model to FLUX.2 Klein | $ / 1024² edit | $ / 40-portrait event | $ / yr (6 events) | Latency / image | Identity-preserving img2img? |
|---|---|---|---|---|---|---|
| **Local Mac (status quo)** | FLUX.2 Klein 4B (mflux) | $0 | $0 | $0 | ~30 s | Yes — current behavior |
| **fal.ai** | **FLUX.2 [klein] 4B edit** | $0.01 (1 MP @ $0.01/MP) | **$0.40** | **$2.40** | sub-second–few seconds | Yes — literally the same model |
| **fal.ai** | FLUX.1 Kontext [pro] (img→img edit) | $0.04 | $1.60 | $9.60 | 2–10 s | Yes (premium) |
| **fal.ai** | FLUX.1 [dev] img→img | $0.03/MP ≈ $0.03 | $1.20 | $7.20 | ~5 s | Yes |
| **fal.ai** | FLUX.2 [pro] edit | $0.03 (1st MP) | $1.20 | $7.20 | ~3 s | Yes |
| **Replicate** | FLUX.1 [dev] | $0.025/img | $1.00 | $6.00 | 3–8 s | Yes (with `image` input) |
| **Replicate** | FLUX.1 Kontext [pro] | $0.04/img | $1.60 | $9.60 | 4–10 s | Yes |
| **Replicate** | FLUX.1 [schnell] | $0.003/img | $0.12 | $0.72 | 1–2 s | Limited — text-only by default; needs img2img variant |
| **Replicate** | FLUX 1.1 [pro] | $0.04/img | $1.60 | $9.60 | 2–5 s | Yes |
| **Together AI** | FLUX.1 [schnell] | $0.003/img | $0.12 | $0.72 | ~2 s | Text-only on Together (no img2img endpoint) |
| **Modal** | DIY (per-second GPU billing) | ~$0.005–$0.02 (H100 @ $3.95/hr × ~10 s) | $0.20–$0.80 | $1.20–$4.80 | 5–30 s + 2–4 s cold start | Yes — you write the code |
| **RunPod serverless** | DIY | ~$0.003–$0.015 (similar GPU/sec) | $0.12–$0.60 | $0.72–$3.60 | 5–30 s + cold start | Yes — you write the code |

**Why the third-party-API numbers are so small:** wizardize is a one-shot
event per player. 8 players × 5 tiers × 6 events = 240 portraits a year.
That's the entire annual volume; this isn't a hot path.

**Why Modal/RunPod aren't free even though they're cheaper per-second:** both
are "bring your own model" — you'd write the FLUX serving code yourself,
manage cold-start warmup, and pay for idle if you keep a worker warm.
mflux on the Mac already does that work for free.

**Why FLUX.2 [klein] on fal.ai is the natural choice if we offload:** it's
literally the same architecture as the Mac is running, so we get bit-for-bit
similar aesthetic output. No prompt re-tuning. The Mac path becomes "fast
local dev loop" and fal becomes "deterministic prod path with no Mac
dependency." Both pipelines stay tested.

---

## Storage cost matrix

Per-portrait JPEG = ~300 KB (1024×1024 mozjpeg @ q=92). 5 tiers + 1 selfie =
~1.8 MB per player.

### Annual storage volumes

| Scenario | Players × portraits | Annual MB | 5-yr cumulative | 10× scale (60 events/yr) |
|---|---|---|---|---|
| Current (6 events × 8 players) | 48 × 6 = 288 portraits | ~85 MB | ~425 MB | ~850 MB/yr |
| Realistic ceiling (regenerates × 2) | 576 portraits | ~170 MB | ~850 MB | ~1.7 GB/yr |
| **Aggressive worst case** | **20 events × 16 players** | **~480 MB/yr** | **~2.4 GB** | **~4.8 GB/yr** |

This is a tournament tool for friends. The "10× scale" column is fantasy;
even the aggressive case stays inside Vercel Blob's free Hobby tier
indefinitely.

### Provider comparison at our scale

| Provider | Storage $/GB-mo | Egress $/GB | Free tier | 1 GB stored, 10 GB egress/mo | 5 GB stored, 50 GB egress/mo |
|---|---|---|---|---|---|
| **Vercel Blob (Hobby)** | $0.023 | $0.05 | **1 GB + 10 GB transfer/mo free** | **$0** (within free tier) | $0.092 storage + $2.00 transfer = **$2.09/mo** |
| **Vercel Blob (Pro)** | $0.023 | $0.05 | 5 GB + 100 GB transfer included in $20/mo Pro | $0 (within Pro allotment) | $0 (within Pro allotment) |
| **Cloudflare R2** | $0.015 | **$0** | 10 GB stored + 1M Class A + 10M Class B ops/mo free | **$0** | **$0** (all under free tier) |
| **Backblaze B2** | $0.005 ($6/TB) | $0.01 (3× storage free; free to Cloudflare/Fastly CDN) | 10 GB stored free | **$0** | **$0** (50 GB egress > 3× 5 GB storage, but free to Cloudflare-fronted) |
| **AWS S3** (reference) | $0.023 | $0.09 | 5 GB / 12 months free | $0 first year, then ~$0.92/mo | ~$4.62/mo |

### At the volumes we actually have

| Year | Cumulative storage | Vercel Blob | R2 | B2 |
|---|---|---|---|---|
| Year 1 | ~170 MB | $0 (free) | $0 (free) | $0 (free) |
| Year 5 | ~850 MB | $0 (free) | $0 (free) | $0 (free) |
| Year 10 (10× scale) | ~8.5 GB | ~$0.17/mo storage + transfer | $0 (free until 10 GB) | ~$0.04/mo |

**Conclusion: storage cost is a non-decision.** All options round to $0
through year 10. The user's instinct that "cloud storage gets expensive" is
the wrong instinct **at this scale** — it would only matter if we stored
training data, video, or thousands of GB.

**Where Vercel Blob *does* cost money: bandwidth on cache misses.** OG
unfurls (Twitter/Discord/iMessage scrapers hit fresh URLs and bypass cache)
and the broadcast TV view (re-fetches the same 5 portraits per player on
load) are the real egress paths. Public Blob delivery serves cached hits
free; cache misses cost $0.05/GB egress + $0.06/GB Fast Origin Transfer.
At ~2 MB/player × 8 players × 100 broadcast page loads/yr = 1.6 GB —
still free-tier territory.

### The "$0 egress" question (R2 vs Vercel Blob)

R2 is famously $0 egress, which is the killer feature for video/podcast
sites. **At our volume it's irrelevant.** Vercel Blob's free 10 GB
transfer/mo and Hobby's bundled limits absorb us. R2 wins on principle but
loses on integration ergonomics:

- Vercel Blob: `put('avatars/<id>/<tier>.jpg', jpeg, { access: 'public' })`
  — one Marketplace install, env var auto-set, done.
- R2: needs Cloudflare account, API token, S3 SDK, custom domain or
  signed URLs for public delivery. The `cloudflare-r2` skill in this repo
  covers it but it's ~20 lines of plumbing vs 1 line for Vercel Blob.

**If we ever migrate off Vercel:** R2 is the obvious second choice (already
have a Cloudflare account from the existing tunnel setup). But "migrate
off Vercel" is a thing we're not planning, so we don't pay for that
optionality today.

---

## Lifecycle / TTL

User said history is disposable. Three possible policies:

1. **No retention policy (recommended).** At 120–500 MB/yr, we hit Hobby
   Blob's 1 GB ceiling in ~3–8 years. Migrate to Pro ($20/mo, includes
   5 GB) when that day comes, or set up R2 then. Don't pre-optimize.

2. **Delete-on-regenerate.** When a player regenerates their wizard,
   delete the old blobs. Vercel Blob's `del()` is free. This is "free"
   in storage terms but adds code paths that can fail. Not worth it.

3. **Time-based TTL** (delete after N days). Vercel Blob has no native
   lifecycle policies — you'd need a cron-style sweep. R2 *does* have
   native object lifecycle rules (S3-compatible). **If we ever care about
   retention, R2 wins purely on this** — set a 365-day expire and forget
   it. But again, we don't care at this volume.

**The architecturally-correct lifecycle answer:** because portrait URLs
are stored in `players.avatar*Url` and regenerating always **overwrites
the same key** (`avatars/<playerId>/<tier>.jpg`) with `allowOverwrite:
true`, there's never a multi-version pile-up. The "history is disposable"
property is already satisfied by the schema — there's no history to
delete. One key per player per tier, forever.

---

## Architecture variants (head-to-head)

### A) Local FLUX + cloud storage (recommended)

```
Phone selfie
   │
   ▼
Vercel Function (claimAction → generateWizardAction)
   │  - validate, mark wizard_job_started_at, return <1s
   │
   ▼  (background, inside after())
imagegen.mised.tech tunnel → Mac (FLUX.2 Klein, ~2.5 min)
   │
   ▼  5 JPEGs → put() → Vercel Blob
   │
   ▼  UPDATE players SET avatar*Url = blob.url
```

- **Cost:** $0/yr generation, $0/yr storage (Hobby tier).
- **Mac dependency:** required for **generation** only. The site, OG
  unfurls, broadcast view, claim page all keep working with the Mac off
  because portraits live on Vercel's CDN.
- **Failure mode:** Mac asleep → user clicks "wizardize" → request times
  out at the imagegen tunnel layer or hangs in the `after()` background.
  Need a server-side fast-fail (`fetch(`${IMAGE_GEN_URL}/health`, {
  signal: AbortSignal.timeout(2000) })`, like recipe-guide's
  candidate-dish-photo.ts already does) so the UI tells the user
  "regeneration unavailable" instead of spinning forever.
- **Effort:** what's already in `vercel-migration.md`. Just execute.

### B) Third-party generation API + cloud storage (alternative)

```
Phone selfie → Vercel Function → fal.ai /flux-2/klein/4b/edit (×5 tiers)
                                  └── 5 JPEGs → Vercel Blob → DB
```

- **Cost:** ~$2.40/yr generation + $0 storage = **~$2.40/yr.**
- **Mac dependency:** none. Run the site, generate portraits, host
  tournaments — all from a phone if you want.
- **Latency:** dramatically better. fal's FLUX.2 Klein is "sub-second"
  per their model card vs ~30 s on the Mac. Full 5-tier set in ~5 s
  total instead of 2.5 min. The whole background-job pattern in
  `generateWizardAction` could collapse back to a synchronous action
  (still keep `after()` to dodge the 300 s budget, but the polling UI
  becomes optional).
- **Failure mode:** fal API down (rare) → same as Mac-off above. fal
  publishes a status page; we'd want a 30-second probe + user-facing
  "try again in a minute" message.
- **Effort:** larger than A. Need fal SDK / API key in env, rewrite the
  `editOnce` function in `src/lib/wizard.ts` to call fal instead of
  `${IMAGEGEN_URL}/edit`, plus prompt/format tuning. The current FLUX.2
  Klein /edit prompts should port directly to fal's FLUX.2 Klein edit
  endpoint with minimal changes (same model), but we'd want to verify
  identity preservation matches on real selfies before cutting over.
- **Loss:** the "feels good to run my own AI locally" property the user
  explicitly values.

### C) Hybrid (local primary, third-party fallback)

```
Phone selfie → Vercel Function → probe imagegen.mised.tech/health
                                 │
                                 ├── reachable → Mac FLUX (current path)
                                 └── unreachable → fal.ai (auto-fallback)
                                                 → Vercel Blob → DB
```

- **Cost:** $0 most of the time, ~$0.40 per portrait set when Mac is off,
  bounded at ~$2.40/yr if Mac is off half the time.
- **Mac dependency:** preferred but not required. Best of both worlds.
- **Latency:** 2.5 min when local, ~5 s when remote.
- **Failure mode:** complex. Two code paths, two prompt formats (close
  but not identical), two sets of error semantics. The health-probe
  becomes load-bearing — false positive ("Mac says it's up but stalls")
  means we waste 2.5 min before falling back. False negative ("Mac
  briefly slow on probe") means we silently spend money.
- **Effort:** highest. Both pipelines need to be tested in CI/`npm run
  verify`, the `SKIP_FLUX=1` story needs to extend to `SKIP_FAL=1`, and
  we'd need to track which path generated each portrait if we ever
  needed to debug aesthetic drift.

### Recommendation

**Ship A. Design A so B is a one-day swap if we ever want it.**

The "design for B-swap" property is mostly free with `vercel-migration.md`
as written — `IMAGEGEN_URL` is already a single env var. To make the swap
trivial later, the only refactor needed today is to lift `editOnce` in
`src/lib/wizard.ts` behind a tiny interface (`type ImageEditor = (selfie:
Buffer, prompt: string) => Promise<Buffer>`) and pick the implementation
based on env (`IMAGE_GEN_PROVIDER=local | fal`). That's ~15 lines and
keeps the door open without committing to C's complexity.

We're not picking C today because:
1. We don't have evidence the Mac will be off often enough for the
   fallback to matter.
2. The verify-script overhead of testing two pipelines doubles every time
   we touch prompts.
3. fal.ai's free tier (small but non-zero) gives us "spike capacity" for
   one-offs without committing to a hybrid architecture.

---

## Unfurl-survival check

OG images at `/events/[id]/opengraph-image.tsx` (or equivalent) read
portrait URLs out of the DB at request time. In architecture A:

- DB row holds `https://<blobstore>.public.blob.vercel-storage.com/avatars/
  abc-123/victory.jpg` (or similar stable Blob URL).
- Vercel function fetches that URL when Twitter/iMessage/Discord scrapes
  the OG endpoint.
- Mac state is irrelevant — the URL is served by Vercel's CDN.

**Result: unfurls work 100 % of uptime, regardless of Mac state.** The
only thing that requires Mac availability is *new* portrait generation,
which the user has explicitly accepted as a constraint.

This is the central reason A is strictly better than the status quo:
right now if the Mac sleeps, *all* portraits 404 because the
`/files/<name>` proxy can't reach `127.0.0.1:8000`. Moving to Vercel
Blob severs that coupling.

---

## Honest math: was the user right?

> "These wizard URL pictures could be cheap and plentiful if I'm doing it
> locally, but might get expensive if I'm storing them in the cloud."

| Claim | Verdict | Why |
|---|---|---|
| Local generation is cheap | **True.** | $0/portrait, ~30 s of Mac time. |
| Cloud generation might be expensive | **False at this scale.** | $0.40/event on fal's FLUX.2 Klein — same model, ~$2.40/yr total. The "Klein" tier is specifically priced for high-volume per-megapixel use. |
| Cloud storage might be expensive | **False at this scale.** | 120 MB/yr is rounding-error on every provider. Free tier covers us until ~2030 at current growth. |
| Local is "plentiful" | **Slightly misleading.** | Plentiful in throughput (we never run out of disk), but **2.5 min per player onboarding is the actual user-experience cost.** That's where cloud APIs would win on UX, not on dollar cost. |

**The interesting cost the user didn't mention:** the Mac's electricity
and uptime. A Mac mini at idle pulls ~10 W; under FLUX load ~80 W for
~2.5 min × 8 players × 6 events = ~2 kWh/yr. At $0.20/kWh that's
~$0.40/yr — same order of magnitude as offloading entirely to fal. Not a
factor, just amusing.

**The non-cost case for hosted generation** is purely about UX latency
and Mac independence, not budget. If we ever want to host a tournament
where the user is on the road and the Mac is off, B (or C) becomes worth
it. Today, A is right.

---

## Open questions

1. **Has anyone validated fal.ai's FLUX.2 Klein produces visually
   identical output to mflux's local FLUX.2 Klein?** Same model weights
   in theory, but the serving stack differs (fal likely uses a quantized
   FP8 variant; mflux uses 4-bit MLX). Worth a 1-portrait A/B before
   committing to B/C in the future. The acceptance criteria is "face
   stays recognizably the same person," which is more forgiving than
   "pixel-identical."

2. **Should we move `selfieUrl` to Blob too, or keep selfies ephemeral?**
   Current schema keeps the raw selfie in storage. It's not displayed
   anywhere player-facing — only used as the input to /edit. If we keep
   it for regeneration without re-upload, it stays in Blob. If we don't,
   we can save ~300 KB/player and dodge the "we're storing photos of
   people's faces" privacy footprint. **Recommendation: ask the user.**
   The CLAUDE.md identity model implies selfies are durable per-player,
   so the safe default is "keep them."

3. **Per-tournament wizard regeneration policy?** A player can regenerate
   their wizard from `/players/[id]/regen`. Each regen writes 5 new
   blobs. With `allowOverwrite: true` they reuse the same keys → no
   storage pile-up. Confirm that's the intended behavior (the
   `vercel-migration.md` plan implies it but doesn't explicitly say
   "overwrite"). Once confirmed, the migration script in step 5 of that
   plan needs to set both `addRandomSuffix: false` and `allowOverwrite:
   true`.

4. **What's the broadcast view's actual cache-hit rate going to be on
   Vercel?** Public Blob URLs are CDN-cached. If the broadcast view hits
   the same 5 portraits per player on every navigation, that's a hot
   cache → free. If we add query-string cache-busters (`?v=<ts>` like
   today's `/files/<name>?v=<ts>` paths), we **invalidate the cache on
   every regenerate** — that's intentional and fine, but worth being
   aware of. Plain Blob URLs are stable and re-cached for free; the
   `?v=` is only needed if `allowOverwrite` is on (which it should be).

5. **Should we eventually ditch the Mac entirely?** That's a future
   conversation, not this one. Today: keep the Mac, move storage to
   cloud, design for an easy fal swap. Revisit if (a) the user gets
   tired of managing the Mac, (b) tournament frequency goes up enough
   that 2.5 min per player onboarding bottlenecks game-day, or (c) the
   user wants to host one without bringing a laptop.

---

## Sources

- [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) — $0.023/GB-mo storage, $0.05/GB transfer, Hobby includes 1 GB + 10 GB transfer free.
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) — $0.015/GB-mo, $0 egress, 10 GB free tier.
- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing) — $6/TB-mo, 3× storage free egress, $0.01/GB after.
- [Replicate pricing](https://replicate.com/pricing) — FLUX.1 dev $0.025/img, schnell $0.003/img, 1.1 pro $0.04/img, H100 $0.001525/sec.
- [fal.ai FLUX.2 klein edit](https://fal.ai/models/fal-ai/flux-2/klein/4b/edit) — $0.01/MP for img2img.
- [fal.ai FLUX.1 dev image-to-image](https://fal.ai/models/fal-ai/flux/dev/image-to-image) — $0.03/MP.
- [fal.ai FLUX.1 Kontext pro](https://fal.ai/models/fal-ai/flux-pro/kontext) — $0.04/img.
- [Black Forest Labs FLUX.2 docs](https://docs.bfl.ml/flux_2/flux2_image_editing) — model capabilities.
- [Modal pricing](https://modal.com/pricing) — H100 $0.001097/sec, $30/mo free credit.
- [RunPod serverless pricing](https://docs.runpod.io/serverless/pricing) — pay-per-second, $5.59/hr serverless H100.
- recipe-guide's `app/lib/planner/candidate-dish-photo.ts` — reference implementation of the "local FLUX → Vercel Blob" pattern this repo will mirror.
