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

# 1. Provision the database (Neon via Vercel Marketplace)
vercel link
vercel install neon
vercel env pull .env.local

# 2. Generate a cookie secret
echo "COOKIE_SECRET=$(openssl rand -hex 32)" >> .env.local

# 3. Apply migrations + seed
#    Seeding creates two leagues: "Demo League" (6 placeholder players) and
#    "Lexington Dads Magic Draft" (empty). Skip the seed if you want a blank
#    install and create your own league via the DB or seed file.
npm run db:migrate
npm run db:seed

# 4. (Optional) Start the local FLUX server for wizard portraits.
#    The app talks to http://127.0.0.1:8000 and skips wizardize gracefully
#    if it's not running. See https://github.com/filipstrand/mflux for setup.

# 5. Develop
npm run dev          # http://localhost:3000
```

Required env vars (`.env.local`):

```env
DATABASE_URL=postgresql://...        # Neon connection string from Vercel
COOKIE_SECRET=...                    # 64 hex chars from openssl rand -hex 32
IMAGEGEN_URL=http://127.0.0.1:8000   # optional, default shown
IMAGEGEN_FILES_TOKEN=...             # shared secret with the image-gen server
                                     # (same value as FLUX server's FILES_TOKEN)
TUNNEL_HOSTNAME=mtg.yourdomain.com   # optional, only for `npm run tunnel:named`
CLOUDFLARE_API_TOKEN=...             # optional, only for `npm run cf:skip-waf`
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-... # optional, enables Google Analytics 4
```

When `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set, the root layout embeds gtag.js via `@next/third-parties/google`'s `<GoogleAnalytics>` component — pageviews land in the [app-traffic dashboard](https://app-traffic.vercel.app/?project=mtg-dash). Unset means analytics is silently disabled (no gtag round-trip). Build-time inlined, so changing it requires a rebuild.

`IMAGEGEN_FILES_TOKEN` authenticates wizard-image uploads to the FLUX server's `/files/<name>` endpoint. Generate with `openssl rand -hex 32` and set the same value as `FILES_TOKEN` in `~/Programs/image-gen/.env`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server with HMR |
| `npm run build` && `npm start` | Production build + serve |
| `npm run lan` | Build + serve on `0.0.0.0:3002`, prints the LAN URL so phones on the same Wi-Fi can connect |
| `npm run tunnel` | Same as `lan`, but fronts the server with a cloudflared Quick Tunnel so phones get a public HTTPS URL (no "Not Secure" warning, no LAN IP literal). Requires `brew install cloudflared`. URL rotates per session. |
| `npm run tunnel:named` | Same as `tunnel`, but uses a *named* Cloudflare Tunnel so the URL stays stable across runs (e.g. `https://mtg.yourdomain.com`). Requires the one-time setup below and `TUNNEL_HOSTNAME=...` in the environment. Auto-kills any leftover `mtg-dash` cloudflared from a prior run so the named tunnel never load-balances onto a stale build. |
| `npm run tunnel:stop` | Tear down every `mtg-dash` cloudflared + the Next.js server on `:3002` in one shot. Use after an ungraceful exit, or if you see the broadcast "flash" the right UI then revert to a stale view (the symptom of two cloudflareds racing). Leaves the system cloudflared at `~/.cloudflared/config.yml` alone. |
| `npm test` | Vitest unit tests (Swiss pairings, ELO math, avatar tier picker) |
| `npm run lint` | ESLint |
| `npm run verify` | End-to-end harness: spins up an isolated `_verify_`-prefixed league + 8-player event, drives every action, exercises the FLUX wizardize pipeline if the server is reachable, then cleans up. ~6 s without FLUX, ~2½ min with it. Set `SKIP_FLUX=1` to skip the image-gen step. |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending migrations to Neon |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Idempotent. Creates the "Demo League" (6 placeholder players) and "Lexington Dads Magic Draft" (empty). Safe to re-run. |
| `npm run migrate:files` | One-shot. Migrates any legacy `/public/{selfies,wizards}/*` images onto the FLUX server's `/files` endpoint and rewrites DB URLs. Already run once on the live data; re-running skips already-migrated rows. |
| `npm run cf:skip-waf` | One-shot. Creates a Cloudflare WAF custom rule that skips managed rules for POST requests to `mtg.<your-host>`, which is required for multipart selfie uploads to reach Next.js through cloudflared. |

## Game-day flow

1. `npm run lan` on the host laptop. Note the LAN URL it prints. (Or `npm run tunnel` for a public HTTPS URL via cloudflared — phones see no security warning, and guests can join from cellular too.)
2. From phones, players hit `/leagues/lexington-dads-magic-draft/claim` (or whatever your league's slug is) and tap an existing wizard or "Create wizard" to onboard. The league cookie sticks for a year.
3. Cast Chrome on the laptop to the TV; open `/leagues/[slug]/events/new`, pick the roster, hit create.
4. Phones in the room scan the QR code in the broadcast corner → land on `/claim`. If they already have a league cookie they see "Continue as X"; otherwise they tap their wizard portrait.
5. Organizer hits "Preview round 1" on `/events/[id]/manage`, reviews the proposed pairings (swap / drop / manual-pair as needed), then "Confirm and start →". Every phone on the event auto-jumps to its new match the moment the round goes live.
6. Players adjust either side's life and report a game win / match draw / opponent win from their phones; the broadcast view updates in real time. Concurrent edits across two phones reconcile via SSE + a 3 s polling fallback (last-write-wins from the server).
7. Round timer counts down 50 minutes by default. When matches finish (or the organizer overrides via `/manage`), the round can be closed. If a pair wants to keep playing into the next round, drop them from the next round's preview — their old match stays in-progress on their phones and they can finish at their own pace while everyone else moves on.
8. After the final round, ELO is updated, final standings are written, the event is marked complete, and both the broadcast view and every phone's `/play` page flip into the final-ranking layout (ranked horizontal grid of wizard cards with per-round W/L/D and ELO deltas underneath each).

### Stable tunnel URL (optional)

If you own a domain on Cloudflare's free DNS, you can swap the rotating `*.trycloudflare.com` URL for a stable one like `https://mtg.yourdomain.com`. One-time setup, then `npm run tunnel:named` instead of `npm run tunnel`:

```sh
brew install cloudflared
cloudflared tunnel login                              # opens browser, picks domain
cloudflared tunnel create mtg-dash                    # writes ~/.cloudflared/<UUID>.json
cloudflared tunnel route dns mtg-dash mtg.yourdomain.com
```

Then add `TUNNEL_HOSTNAME=mtg.yourdomain.com` to `.env.local` (the script sources it automatically) — or prefix the command for a one-off. The script generates a temporary cloudflared config from that env var on each run, so no YAML to edit by hand. `TUNNEL_NAME` defaults to `mtg-dash` but can be overridden if you reuse the tunnel for other projects.

## Architecture notes

- **Identity is per-league**: `players` rows belong to a single `league` (`players.league_id`) and carry a durable `league_token`. Tapping a wizard on `/leagues/[slug]/claim` sets an `mtg_league_<leagueId>` httpOnly cookie scoped to `/`, good for a year, so the player is recognized across every event in that league. Portable cross-league identities are a future migration.
- **Per-event cookies**: each `event_players` row still gets a 192-bit `join_token`. Claiming on `/events/[id]/claim` sets both the per-event cookie (used by `/play` and the realtime views) and the league cookie. No real auth — friends-only assumption.
- **Real-time**: a single in-process `Map<eventId, Set<controller>>` pubsub. Mutations hit Postgres, then publish a typed event (`life_changed`, `game_complete`, `match_complete`, `round_started`, `round_completed`). Broadcast view holds one EventSource and re-renders accordingly.
- **Wizard tiers**: five portraits are generated upfront — three life-based (fresh > 75 %, wounded 25–75 %, critical ≤ 25 %) and two match-outcome (victory, defeat). The broadcast `PlayerSide` calls `pickAvatarUrl` while a match is in progress and `pickMatchOutcomeAvatar` once it resolves; both cascade through sibling tiers so older 3-tier players still render correctly.
- **HEIC handling**: iPhone selfies hit a Sharp pipeline with libheif so they normalize to a 1024×1024 JPEG before going to FLUX `/edit`.
- **Image storage**: generated portraits are stored on the FLUX server (`~/Programs/image-gen/files/`), not in the Next.js `/public` dir. The DB stores `/files/<name>?v=<ts>` URLs; the Next.js proxy route at `src/app/files/[file]/route.ts` streams them from `127.0.0.1:8000/files/<name>` to the browser. This keeps image storage decoupled from the Next build manifest, so a freshly wizardized player's portrait appears without rebuilding. The same files are also reachable directly at `imagegen.mised.tech/files/<name>` if you've set up that ingress.
- **Wizardize is a background job**: `generateWizardAction` flips a `wizard_job_started_at` flag and returns in under a second; a fire-and-forget Promise then runs the ~2½ min FLUX work and writes results when done. The player page polls `router.refresh()` every 4 s while the flag is set. This pattern exists because Cloudflare's free-tier edge has a 100 s HTTP response timeout that would kill a synchronous wizardize.
- **Cloudflare WAF caveat**: behind cloudflared, multipart selfie uploads match the managed OWASP ruleset and get blocked with a 403 unless you install a skip rule. `npm run cf:skip-waf` does this once via the Cloudflare API.

## What this is not

- Not a Wizards-sanctioned tournament tool — house events only, no DCI numbers.
- Not multi-tenant. One organizer, one Neon DB.
- Not a replacement for the MTG Companion app — Companion has no public API; you can keep using it for card lookups.

## License

MIT.
