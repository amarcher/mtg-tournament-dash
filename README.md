# mtg-dash

A self-contained tournament dashboard for hosting Magic: The Gathering nights at home — pairings, real-time life totals on a TV, phone-based score keeping, ELO history across events, and AI-generated wizard portraits whose appearance changes as players take damage.

Built because no off-the-shelf tool ships a TV broadcast view with live life totals, and the MTG Companion app has no public API to integrate with.

## What's in here

- **Leagues** (`/leagues/[slug]`) — every wizard and every event belongs to a league (e.g. "Lexington Dads Magic Draft"). New players self-create their identity from `/leagues/[slug]/claim` straight from a phone; the per-league cookie survives across every event in that league, so a returning player just taps their wizard once.
- **Broadcast view** (`/events/[id]/broadcast`) — full-screen 16:9 layout for casting to a TV. Live life totals, Swiss pairings, round timer, standings, damage/heal pulse animations. Each player's wizard portrait is the background of their cell and crossfades through three damage tiers as their life drops. Once the final round closes the same screen flips into a **final-ranking layout** — one wizard card per player in finishing order, with the champion in their victory portrait, the last-place finisher in their defeat portrait, and a per-round opponent + result + ELO-delta breakdown underneath each card.
- **Phone score keeping** (`/events/[id]/play`) — players adjust either side's life and report game wins, a match draw, or "they won" from a one-handed phone UI. Updates fan out over SSE *and* a 3 s polling reconcile loop, so even if a `life_changed` event is lost in transit both phones converge to the server total. When the organizer advances rounds, every phone auto-jumps to its new pairing — no pull-to-refresh.
- **One-tap join** — `/events/[id]/claim` shows the event roster as tappable cards. A QR code in the broadcast corner links straight there. If the visitor already has a league cookie, the page recognizes them and offers a single "Continue as X" button. Both `/players/[id]` and `/leagues/[slug]` surface a prominent "▶ Scorekeeper" CTA the moment a player is on an open event's roster, so a phone that just finished wizardize has an obvious next step.
- **Pairing review** (organizer-side, on `/events/[id]/manage`) — "Preview round N" stages auto-generated Swiss pairings in a `pending` state that players don't see. The organizer can swap two players between tables, drop a pair (their previous-round match stays live on those two phones so they can keep playing while everyone else moves on), re-roll the auto pairings, or add a manual pairing from the unpaired list before tapping "Confirm and start →".
- **Selfie-to-wizard** — players upload a phone selfie (HEIC works), pick an archetype (pyromancer, frost mage, druid, necromancer, illusionist, stormcaller, blood mage, archmage), and the FLUX.2 Klein image-edit model generates five identity-preserving portraits — fresh, wounded, critical (mid-fight states) plus victory and defeat (post-match states). All five are family-friendly (no blood/gore). Generated images live on the image-gen server and are streamed through the Next.js `/files/<name>` proxy route.
- **Scheduling** (`/leagues/[slug]/schedule`) — two complementary tools. The **calendar** opens a standing run of dates up front (generated from a cadence — "every other Monday from Aug 31" — or added one at a time); everyone RSVPs ✅ / 🟡 / ❌ per date from a phone and can change their answer any time, while the organizer fills in the plan for each night: the set being drafted, who's hosting, and where. **Date polls** stay for the Doodle-style case where the night isn't on the calendar yet: propose candidates, everyone marks availability, pick the winner. Either one promotes into a real event in one tap, pre-rostering whoever said yes / if-need-be.
- **League-scoped history** — head-to-head, per-player profiles, and ELO ratings (K=32, starting 1200) accumulate across every event in the league.
- **Swiss pairings** — pure backtracking matching with rematch avoidance and bye handling. Unit-tested. `src/lib/pairings/swiss.ts`.

## Stack

- [Next.js 16](https://nextjs.org/) App Router with Turbopack
- [Drizzle ORM](https://orm.drizzle.team/) over [Neon Postgres](https://neon.tech/) (Vercel Marketplace)
- [Tailwind v4](https://tailwindcss.com/) + [Motion](https://motion.dev/) for animations
- [Vitest](https://vitest.dev/) for unit tests
- Server-Sent Events for real-time fan-out (no Pusher/Ably; in-memory pubsub keyed by event id)
- Local [FLUX.2 Klein](https://github.com/black-forest-labs/flux) running on Apple Silicon via [mflux](https://github.com/filipstrand/mflux) for wizard portrait generation. Free, private, ~30 s/portrait.

## Quick start

```sh
git clone <repo-url> mtg-dash
cd mtg-dash
npm install

# 1. Provision Vercel-linked resources (Neon DB, Blob storage, Upstash Redis)
vercel link
vercel install neon
vercel blob create-store mtg-dash-blob --access=public --yes
vercel install upstash/upstash-kv --plan paid -m primaryRegion=iad1
vercel env pull .env.local

# 2. Apply migrations + seed
#    Seeding creates two leagues: "Demo League" (6 placeholder players) and
#    "Lexington Dads Magic Draft" (empty). Skip the seed if you want a blank
#    install and create your own league via the DB or seed file.
npm run db:migrate
npm run db:seed

# 3. (Optional) Start the local FLUX server for wizard portraits.
#    The app talks to http://127.0.0.1:8000 in dev (and imagegen.mised.tech
#    in prod via a Cloudflare tunnel). Wizardize is skipped gracefully if
#    the server isn't reachable. See https://github.com/filipstrand/mflux.

# 4. Develop
npm run dev          # http://localhost:3000
```

Required env vars (`.env.local`):

```env
DATABASE_URL=postgresql://...        # Neon, from `vercel env pull`
BLOB_READ_WRITE_TOKEN=...            # Vercel Blob, from `vercel env pull`
KV_REST_API_URL=...                  # Upstash for Redis (Realtime),
KV_REST_API_TOKEN=...                #   both from `vercel env pull`
IMAGE_GEN_URL=http://127.0.0.1:8000  # local FLUX; prod uses imagegen.mised.tech
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-... # optional, enables Google Analytics 4
```

`BLOB_READ_WRITE_TOKEN` is required for wizard portrait storage — `uploadPortrait` throws if it's missing. `KV_REST_API_URL` / `KV_REST_API_TOKEN` enable cross-instance SSE pub/sub via `@upstash/realtime`; when unset, an in-process `Map` covers single-host dev (fine for `npm run dev` / `lan` / `verify`).

When `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set, the root layout embeds gtag.js via `@next/third-parties/google`'s `<GoogleAnalytics>` component — pageviews land in the [app-traffic dashboard](https://app-traffic.vercel.app/?project=mtg-dash). Unset means analytics is silently disabled (no gtag round-trip). Build-time inlined, so changing it requires a rebuild. **Scoped to Production on Vercel** so preview pageviews don't pollute the prod stream.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server with HMR |
| `npm run build` && `npm start` | Production build + serve |
| `npm run lan` | Build + serve on `0.0.0.0:3002`, prints the LAN URL so phones on the same Wi-Fi can connect. Useful when guests' phones can't reach prod (no internet at a venue, etc.). |
| `npm test` | Vitest unit tests (Swiss pairings, ELO math, avatar tier picker, pub/sub fallback, Realtime schema) |
| `npm run lint` | ESLint |
| `npm run verify` | End-to-end harness: spins up an isolated `_verify_`-prefixed league + 8-player event, drives every action, exercises the FLUX wizardize pipeline if the server is reachable, then cleans up. ~6 s without FLUX, ~2½ min with it. Set `SKIP_FLUX=1` to skip the image-gen step. |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending migrations to Neon |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Idempotent. Creates the "Demo League" (6 placeholder players) and "Lexington Dads Magic Draft" (empty). Safe to re-run. |
| `npm run migrate:blob` | One-shot. Walks every `players` row pointing at a legacy `/files/<name>` URL, uploads the bytes to Vercel Blob at `avatars/<playerId>/<tier>.jpg`, and rewrites the DB columns. Already run once on prod; re-runs are no-ops. |

## Game-day flow

1. Phones hit the production URL (`https://mtg.capxun.com/` or the canonical Vercel alias). If you want to run a tournament without internet, `npm run lan` on the host laptop and have phones connect to the LAN URL it prints.
2. From phones, players hit `/leagues/lexington-dads-magic-draft/claim` (or whatever your league's slug is) and tap an existing wizard or "Create wizard" to onboard. The league cookie sticks for a year.
3. Cast Chrome on the laptop to the TV; open `/leagues/[slug]/events/new`, pick the roster, hit create.
4. Phones in the room scan the QR code in the broadcast corner → land on `/claim`. If they already have a league cookie they see "Continue as X"; otherwise they tap their wizard portrait.
5. Organizer hits "Preview round 1" on `/events/[id]/manage`, reviews the proposed pairings (swap / drop / manual-pair as needed), then "Confirm and start →". Every phone on the event auto-jumps to its new match the moment the round goes live.
6. Players adjust either side's life and report a game win / match draw / opponent win from their phones; the broadcast view updates in real time. Concurrent edits across two phones reconcile via SSE + a 3 s polling fallback (last-write-wins from the server).
7. Round timer counts down 50 minutes by default. When matches finish (or the organizer overrides via `/manage`), the round can be closed. If a pair wants to keep playing into the next round, drop them from the next round's preview — their old match stays in-progress on their phones and they can finish at their own pace while everyone else moves on.
8. After the final round, ELO is updated, final standings are written, the event is marked complete, and both the broadcast view and every phone's `/play` page flip into the final-ranking layout (ranked horizontal grid of wizard cards with per-round W/L/D and ELO deltas underneath each).

## Architecture notes

- **Calendar vs. poll**: `game_nights` are dates the league has already committed to (unique per `(league_id, starts_at)`, so re-running a recurrence is idempotent) and collect a rolling `night_rsvps` row per player. `date_polls` pick ONE date out of several candidates and then close. Both carry a one-way link into `events` (`source_night_id` / `source_poll_id`, each uniquely indexed so a double-tap can't spawn two events). Recurrence math lives in `src/lib/recurrence.ts` and steps whole calendar days on *wall* time, so a 7pm series stays at 7pm across a DST change.
- **Identity is per-league**: `players` rows belong to a single `league` (`players.league_id`) and carry a durable `league_token`. Tapping a wizard on `/leagues/[slug]/claim` sets an `mtg_league_<leagueId>` httpOnly cookie scoped to `/`, good for a year, so the player is recognized across every event in that league. Portable cross-league identities are a future migration.
- **Per-event cookies**: each `event_players` row still gets a 192-bit `join_token`. Claiming on `/events/[id]/claim` sets both the per-event cookie (used by `/play` and the realtime views) and the league cookie. No real auth — friends-only assumption.
- **Real-time**: in prod, `src/lib/pubsub.ts` publishes to Redis Streams via `@upstash/realtime` (channel = `event:<eventId>`); the SSE route subscribes with `historyLimit: 50` so reconnects after Vercel's 300 s function-duration cap replay missed events automatically. When `KV_REST_API_URL` is unset (local dev), pubsub.ts falls back to an in-process `Map<eventId, Set<Subscriber>>`. Broadcast and Play clients consume via EventSource + a polling reconcile (10 s on the TV, 3 s on phones).
- **Wizard tiers**: five portraits are generated upfront — three life-based (fresh > 75 %, wounded 25–75 %, critical ≤ 25 %) and two match-outcome (victory, defeat). The broadcast `PlayerSide` calls `pickAvatarUrl` while a match is in progress and `pickMatchOutcomeAvatar` once it resolves; both cascade through sibling tiers so older 3-tier players still render correctly.
- **HEIC handling**: iPhone selfies hit a Sharp pipeline with libheif so they normalize to a 1024×1024 JPEG before going to FLUX `/edit`.
- **Image storage**: generated portraits live on Vercel Blob with the stable key `avatars/<playerId>/<tier>.jpg` (`allowOverwrite: true`). The DB stores the absolute Blob URL with a `?v=<ts>` cache buster so regenerates force browsers to drop stale copies. The Mac is no longer in the read path — only the *write* path while generating, via the `imagegen.mised.tech` cloudflared tunnel pointing at the local FLUX server.
- **Wizardize is a background job**: `generateWizardAction` flips a `wizard_job_started_at` flag, returns in under a second, and uses `after()` from `next/server` to run the ~2½ min FLUX pipeline past the response. Each FLUX fetch carries `AbortSignal.timeout(240_000)` so the pipeline bails ~60 s before Vercel's 300 s function-duration kill. If `after()` is killed mid-job anyway, `sweepStaleWizardJobs()` clears the in-progress flag on the next page render (6-minute threshold + null-avatar check).
- **App icon is per-user**: `/icon/{192,512}` and `/apple-icon` are dynamic — they read the visitor's `mtg_league_<id>` cookie, look up the claimed wizard, and serve that player's victory portrait. Falls back to the bundled May 12 champion when no cookie is set. The OS caches the install-time PNG forever, so the "trophy at install" property holds.

## What this is not

- Not a Wizards-sanctioned tournament tool — house events only, no DCI numbers.
- Not multi-tenant. One organizer, one Neon DB.
- Not a replacement for the MTG Companion app — Companion has no public API; you can keep using it for card lookups.

## License

MIT.
