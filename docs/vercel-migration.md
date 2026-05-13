# Vercel migration plan

The current setup runs mtg-dash on a Mac at home, fronted by a Cloudflare
named tunnel at `mtg.capxun.com`. That works but the site goes dark whenever
the Mac sleeps, the tunnel drifts, or the LAN reboots. This plan moves
mtg-dash itself to Vercel and keeps only the FLUX image-gen server at home
(reached via the existing `imagegen.mised.tech` tunnel).

## Decisions

- **Real-time fan-out:** Upstash Redis pub/sub (Marketplace). Sub-100ms event
  delivery across function instances. Add snapshot-on-reconnect to absorb
  the 300s function-duration reconnect cliff.
- **Offline-LAN fallback:** none. Internet is assumed available. `npm run
  lan` stays available for local dev, but no plan to run tournaments without
  internet.
- **Domain:** clean-break (new Vercel domain or `*.vercel.app`). Existing
  `mtg.capxun.com` cookies will not transfer — claimed players re-claim on
  first visit.

## Target shape

```
Phones ──HTTPS──> Vercel (mtg-dash Next.js, Fluid Compute)
                    ├─ Neon Postgres (Marketplace)
                    ├─ Vercel Blob          ← wizard JPEGs (CDN-served)
                    ├─ Upstash Redis        ← cross-instance SSE pub/sub
                    └─ outbound → imagegen.mised.tech tunnel
                                    (only during wizardize)
```

## Phase 1 — Storage & generation off the tunnel

1. Provision **Vercel Blob** via Marketplace. `BLOB_READ_WRITE_TOKEN` lands
   in env automatically.
2. In `generateWizardAction` (`src/app/events/actions.ts`), replace the
   `POST ${IMAGEGEN_URL}/files/<name>` upload step with
   `put('avatars/<playerId>/<tier>.jpg', jpeg, { access: 'public' })` from
   `@vercel/blob`. Store the returned `blob.url` directly in
   `players.avatar*Url` (full URL, not a `/files/<name>` path).
3. Wrap the fire-and-forget 2.5-min FLUX block in `after(async () => {…})`
   from `next/server`. Keeps the <1s response, lets the long work run inside
   the 300s function budget.
4. Rename `IMAGEGEN_URL` → `IMAGE_GEN_URL` to match the recipe-guide
   convention. Make it **optional**: if unset, `generateWizardAction` throws
   a user-facing "image generation not configured" error. In Vercel prod env
   set to `https://imagegen.mised.tech`; the existing system cloudflared
   already serves that subdomain.
5. **Migration script** (`scripts/migrate-files-to-blob.ts`): for each
   players row with `avatar*Url` starting with `/files/`, download via
   `${PUBLIC_URL}/files/<name>`, `put()` to Blob, update DB row, log
   progress. Idempotent — re-runnable if interrupted.
6. After the migration script runs, delete `src/app/files/[file]/route.ts`
   and the related comment in CLAUDE.md.

## Phase 2 — Cross-instance pub/sub

7. Provision **Upstash Redis** via Marketplace. `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` land in env. Choose the global region.
8. Rewrite `src/lib/pubsub.ts` internals while keeping the public signatures
   identical:
   - `publish(eventId, msg)` → `redis.publish('mtg:event:'+eventId,
     JSON.stringify(msg))`
   - `subscribe(eventId, cb)` lazily opens a Redis subscriber for the
     channel (one subscriber per function instance per eventId, refcounted
     across local subscribers), dispatches messages to local callbacks. On
     last unsubscribe, close the Redis subscriber.
   - Drop the `globalThis` symbol shim — Redis is the source of truth.
9. SSE route (`src/app/api/events/[id]/stream/route.ts`):
   - On connect, before subscribing, send a **snapshot frame**:
     `{ type: 'snapshot', round, matches, standings }` derived from the same
     queries the broadcast page uses.
   - Add `type: 'snapshot'` to the `EventMessage` union.
   - `BroadcastClient.tsx`, `PlayClient.tsx`, `WaitForRound.tsx` handle the
     `snapshot` event by replacing local state in one shot before applying
     subsequent live events.
   - This is how we tolerate the 300s function-duration cliff: client
     auto-reconnects → server sends fresh snapshot → no missed-event drift.

## Phase 3 — Hosting cutover

10. Create a Vercel project linked to the repo. Build command stays
    `npm run build`. Output dir defaults are fine.
11. Link Neon via Marketplace (either share the existing project or create a
    new one + copy data). Use the **pooled connection string** for
    `DATABASE_URL`; non-pooled goes in `POSTGRES_URL_UNPOOLED` for the
    migration runner.
12. Env vars to set on Vercel (production):
    - `DATABASE_URL` — Neon pooled
    - `COOKIE_SECRET` — 64 hex chars (rotate from current value)
    - `IMAGE_GEN_URL=https://imagegen.mised.tech`
    - `IMAGEGEN_FILES_TOKEN` — same value as image-gen server
    - `BLOB_READ_WRITE_TOKEN` — auto-set by Marketplace
    - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — auto-set
    - `NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-…` (rebuild on change — NEXT_PUBLIC
      is build-time inlined)
13. Update `src/lib/public-url.ts` (`getPublicBaseUrl`):
    - If `process.env.VERCEL`: return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      (or a hard-coded production domain once set).
    - Else keep the existing LAN auto-detect for `npm run lan`.
14. First deploy goes to a Vercel **preview URL**. Use a Neon **branch DB**
    for the smoke test so prod data stays clean. Walk through:
    - Create league + event
    - Claim player on phone (cookie test against new domain)
    - Wizardize a player end-to-end (Vercel → imagegen tunnel → FLUX → Blob)
    - Round-by-round SSE on both broadcast + phone (cross-instance pub/sub
      test — open broadcast on laptop, phone on cellular, mutate from a
      third device)
    - 5+ min broadcast tab open to validate snapshot-on-reconnect
15. Pick the production domain. CNAME or set up Vercel-managed DNS.
    Promote preview → prod.
16. Stop `npm run tunnel:named` on the Mac. Keep the system cloudflared
    serving `imagegen.mised.tech`.

## Phase 4 — Cleanup

17. Delete:
    - `scripts/tunnel.sh`, `scripts/tunnel-named.sh`, `scripts/tunnel-stop.sh`
    - `scripts/cf-skip-waf-uploads.ts`
    - `tunnel`, `tunnel:named`, `tunnel:stop`, `cf:skip-waf` scripts in
      package.json
    - Cloudflare WAF custom rule (no longer fronted by Cloudflare)
18. Delete `src/app/files/[file]/route.ts` once migration script has run and
    `SELECT count(*) FROM players WHERE avatar_url LIKE '/files/%'` returns
    zero.
19. Update `README.md` and `CLAUDE.md`:
    - Remove the "Running behind a Cloudflare tunnel" section
    - Replace with "Deploying to Vercel" + "Image-gen tunnel (dev/prod)"
    - Update "Required env vars" list

## What stays

- `npm run dev` and `npm run lan` for local iteration with hot reload.
- The Mac's FLUX server at `127.0.0.1:8000`. Only the existing
  `imagegen.mised.tech` tunnel needs to stay up; the system cloudflared
  config (`~/.cloudflared/config.yml`) already handles this.
- Vercel preview deploys replace `npm run tunnel:named` as the
  "show someone else over the internet" loop.
- All identity / cookie / auth code paths — only the domain changes.

## Risks / gotchas

- **Neon connection ceiling.** Serverless can spike connections. Always use
  the pooled URL for runtime queries; Drizzle works fine with PgBouncer.
- **Wizard `after()` failure.** If the function crashes mid-FLUX-call, the
  player's `wizard_job_started_at` stays set forever and the UI shows the
  spinner indefinitely. Add a stale-job sweep: if `started_at` is older
  than ~5 min and the avatar URLs haven't changed, clear it on next page
  load.
- **Blob URL stability.** Vercel Blob URLs are stable, but if you ever
  delete & re-create, the URL changes. DB-stored URLs assume permanence —
  treat them as immutable once written.
- **SSE on Fluid Compute.** Each SSE stream holds a function instance for
  up to 300s. With a 6-player tournament + 1 broadcast TV, that's ~7
  long-lived streams. Should fit comfortably in the free tier; revisit if
  hosting more tournaments concurrently.
- **Cookie continuity loss.** Clean-break domain means existing claimed
  players re-claim. Communicate this to whoever's running the next
  tournament; consider a one-time "welcome back, re-claim your seat"
  banner on the claim page during the transition window.
