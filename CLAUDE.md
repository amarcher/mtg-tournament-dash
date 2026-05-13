@AGENTS.md

# Working in this repo

This is a Next.js 16 App Router app for hosting Magic: The Gathering tournaments at home. It runs against Neon Postgres via Drizzle, talks to a local FLUX.2 Klein image-edit server at `http://127.0.0.1:8000` for wizard portrait generation, and uses Server-Sent Events for real-time fan-out. The full architecture is in `README.md`; the original implementation plan and feature addenda live at `~/.claude/plans/i-m-interested-in-hosting-keen-hejlsberg.md`.

## Verification gate

Before reporting any non-trivial change as done, run **all four**:

```sh
npm test            # unit tests (Swiss, ELO, avatar tier picker) — must stay ≥41 passing
npm run lint        # ESLint
npm run build       # production build (catches RSC/client-boundary issues lint misses)
npm run verify      # end-to-end harness — see scripts/verify.ts
```

`npm run verify` spins up an isolated `_verify_`-prefixed 8-player league + event, drives every server action, exercises the FLUX wizardize pipeline if the local image-gen server is up (~2½ min total for 5 tiers) or skips it gracefully (~6 s), then cleans up. Use `SKIP_FLUX=1` to skip the image-gen step. Idempotent — re-running after a crashed run wipes leftovers automatically.

## Conventions

- **Identity is league-scoped.** Every `players` row belongs to a single `leagues` row. League membership is the unit of identity — the same person playing in two leagues is two separate `players` rows (portable identities are a future migration). `players.league_token` is the durable per-league session token; the per-event `event_players.join_token` is a finer-grained scope set when a player claims a seat in a specific event.
- **Server actions** live in `src/app/events/actions.ts`. The file is `"use server"`, so it can only export async functions. Constants must live in non-`"use server"` modules — see `src/lib/wizard-types.ts` next to `src/lib/wizard.ts` for the established split when a constant has to be shared between client and server code.
- **Client/server boundary**: anything importing `node:fs/promises`, `sharp`, or talking to FLUX must not be reachable from a Client Component. Pull constants/types into a separate `*-types.ts` module if both sides need them.
- **DB access**: use the typed query helpers in `src/db/queries.ts` rather than ad-hoc Drizzle in components. The roster-shaped queries return all five tier URLs (`avatarUrl` / `avatarWoundedUrl` / `avatarCriticalUrl` / `avatarVictoryUrl` / `avatarDefeatUrl`) — extend them rather than duplicating the joins.
- **Real-time**: every mutation that changes user-visible state should `await publish(eventId, ...)` from `src/lib/pubsub.ts` so the broadcast view + phone views update without a refresh. The `EventMessage` union is the contract. When `KV_REST_API_URL` is set (prod / linked to Upstash), publishes route through `@upstash/realtime` over Redis Streams so multiple Vercel function instances stay coherent; reconnecting clients replay the last 50 events automatically. When unset (local dev, `npm run lan`, `npm run verify`), the fallback is an in-process `Map` that's only correct on a single host — fine for dev.
- **Generated image storage** is durable: when `BLOB_READ_WRITE_TOKEN` is set, `src/lib/wizard.ts`'s `uploadPortrait` writes to Vercel Blob with the stable key `avatars/<playerId>/<tier>.jpg` (`allowOverwrite: true`) and stores the absolute Blob URL in the DB. When the token is unset, the legacy `/files/<name>` PUT-to-image-gen path still works for local-only dev. New rows always go to Blob in prod; the `src/app/files/[file]/route.ts` proxy survives until Phase 4 of `docs/migration-roadmap.md` clears the last legacy row. Don't go back to writing to `/public` — Next's build manifest snapshots `/public` at build time and won't serve files added after.
- **Don't add comments** that explain *what* code does — names should already do that. Comments are for the *why* (a non-obvious constraint, a workaround, a reason a hot path is structured oddly).
- **Don't add backwards-compat shims** when you can just change the call sites. The codebase is small.

## What not to break

- The `setPlayerCookie` / `getCurrentPlayer` cookie scheme (per-event) and the `setLeagueCookie` / `getCurrentLeaguePlayer` scheme (per-league, durable) in `src/lib/auth.ts`. The `/events/[id]/join/[token]` route, the `/events/[id]/claim` page, `/leagues/[slug]/claim`, and any future identity entry point funnel into one of these.
- The `pickAvatarUrl` cascading fallback in `src/lib/avatar-tier.ts`. Players who only have a single `avatarUrl` (uploaded before the tiered system existed) still need to render correctly. Same for `pickMatchOutcomeAvatar`, which cascades victory→fresh and defeat→critical→wounded→fresh.
- The `revalidatePath` wrapper at the top of `src/app/events/actions.ts` — it intentionally swallows `revalidatePath` errors so the verify script can drive server actions outside a request scope. Don't replace it with the raw `next/cache` import.
- The wizardize background-job pattern in `generateWizardAction`. The action sets `wizard_job_started_at` and returns in <1 s, then a fire-and-forget Promise does the ~2½ min FLUX work. This exists specifically because Cloudflare's free-tier 100 s HTTP timeout cuts long server-action responses; do not inline the work back into the action.
- The `/files/[file]` proxy route — see "Generated image storage" above. It's the bridge that makes images written to the FLUX server visible through `mtg.capxun.com`.

## When changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` (creates a numbered SQL file under `drizzle/`).
3. `npm run db:migrate` (applies to Neon).
4. Update the relevant query helpers in `src/db/queries.ts` to thread new columns through.
5. Migrations are additive only — never drop or rename a column without an explicit user request.

## When adding a new entry point that touches identity

The current entry points are: `/leagues/[slug]/claim` (primary onboarding — create wizard or pick existing), `/events/[id]/claim` (per-event seat claim), `/events/[id]/join/[token]` (deep-link fallback), `/players/[id]` regen pages. Any new entry point should still funnel through `setPlayerCookie(eventId, joinToken)` (per-event) and/or `setLeagueCookie(leagueId, leagueToken)` (per-league). `claimIdentityAction` is the model — it sets both cookies so a player who claims a seat is also recognized league-wide on their next visit.

## When adding a new server action

1. Add to `src/app/events/actions.ts` as an async export.
2. Validate inputs at the top, throwing `Error` with a user-facing message on failure.
3. Mutate the DB.
4. Publish a typed `EventMessage` if any view should re-render in response.
5. Call `revalidatePath` for any page route whose data changed.
6. Add coverage to `scripts/verify.ts` so the action is exercised end-to-end.

## Running the LAN demo

`npm run lan` on the host machine builds + serves on `0.0.0.0:3002` and prints the LAN URL. macOS may prompt to allow incoming connections — accept. Phones on the same Wi-Fi can then scan the QR code in the broadcast header to land on the claim page without typing the IP.

## Deployment

Production runs on **Vercel** at `mtg.capxun.com` (CNAME via Cloudflare DNS-only) and the Vercel-alias `mtg-dash.vercel.app`. Pushing to `main` auto-deploys to production; branch pushes get preview URLs. See `docs/migration-roadmap.md` for the full migration history and rationale.

The Mac at home still runs **one** thing the prod site depends on: the FLUX image-gen server on `127.0.0.1:8000`, fronted by the system cloudflared at `~/.cloudflared/config.yml` exposing it at `imagegen.mised.tech`. Vercel reaches this for new wizardize runs. When the Mac is asleep, the site keeps working — only *generating* a new portrait fails until the Mac wakes. Existing portraits live on Vercel Blob and are CDN-served.

**`db.transaction()` is not available** under the `@neondatabase/serverless` HTTP driver this app uses. Each `db.something()` call is one HTTPS roundtrip. If you ever need a multi-statement transaction, switch the affected callsite to the WebSocket/Pool driver, or restructure.

## Required env vars

Pull with `vercel env pull .env.local` after linking the project.

- `DATABASE_URL` — Neon Postgres connection string. Set in Vercel for all envs via the Neon marketplace integration.
- `IMAGE_GEN_URL` — defaults to `http://127.0.0.1:8000` for local dev. In Vercel set to `https://imagegen.mised.tech` so cloud functions can reach the home Mac.
- `BLOB_READ_WRITE_TOKEN` — set by the Vercel Blob marketplace integration. Required wherever the wizard action runs: `uploadPortrait` throws on missing token.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — set by the Upstash for Redis marketplace integration. Required in prod for cross-instance pub/sub via `@upstash/realtime`. When unset, `src/lib/pubsub.ts` falls back to an in-process `Map` (fine for `npm run dev` / `lan` / `verify`).
- `NEXT_PUBLIC_GA4_MEASUREMENT_ID` — optional. `G-XXXXXXXXXX` from analytics.google.com. When set, the root layout embeds `@next/third-parties/google`'s `<GoogleAnalytics>` so pageviews show up in the [app-traffic dashboard](https://app-traffic.vercel.app/?project=mtg-dash). **Scoped to Production on Vercel** so preview pageviews don't pollute the prod GA4 stream. **Build-time inlined** (the `NEXT_PUBLIC_` prefix), so you have to rebuild after changing it. The matching numeric Property ID lives in the app-traffic project's Vercel env as `GA4_PROPERTY_ID_MTG_DASH`.
