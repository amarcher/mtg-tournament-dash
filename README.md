# mtg-dash

A self-contained tournament dashboard for hosting Magic: The Gathering nights at home — pairings, real-time life totals on a TV, phone-based score keeping, ELO history across events, and AI-generated wizard portraits whose appearance changes as players take damage.

Built because no off-the-shelf tool ships a TV broadcast view with live life totals, and the MTG Companion app has no public API to integrate with.

## What's in here

- **Broadcast view** (`/events/[id]/broadcast`) — full-screen 16:9 layout for casting to a TV. Live life totals, Swiss pairings, round timer, standings, damage/heal pulse animations. Each player's wizard portrait is the background of their cell and crossfades through three damage tiers as their life drops.
- **Phone score keeping** (`/events/[id]/play`) — players adjust their own life total and report game / match wins from one-handed phone UI. Updates fan out over Server-Sent Events.
- **One-tap join** — `/events/[id]/claim` shows the wizard-portrait roster as tappable cards. A QR code in the broadcast corner links straight there, so phones don't need to know the LAN IP.
- **Selfie-to-wizard** — players upload a phone selfie (HEIC works), pick an archetype (pyromancer, frost mage, druid, necromancer, illusionist, stormcaller, blood mage, archmage), and the FLUX.2 Klein image-edit model generates three identity-preserving portraits at full / wounded / critical states.
- **Persistent history** — head-to-head matrix, per-player pages, ELO ratings (K=32, starting 1200) accumulated across every event you've ever run.
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
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server with HMR |
| `npm run build` && `npm start` | Production build + serve |
| `npm run lan` | Build + serve on `0.0.0.0:3002`, prints the LAN URL so phones on the same Wi-Fi can connect |
| `npm test` | Vitest unit tests (Swiss pairings, ELO math, avatar tier picker) |
| `npm run lint` | ESLint |
| `npm run verify` | End-to-end harness: spins up an isolated 8-player tournament, drives every action, exercises the FLUX wizardize pipeline if the server is reachable, then cleans up. ~6 s without FLUX, ~50 s with it. Set `SKIP_FLUX=1` to skip the image-gen step. |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending migrations to Neon |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Seed a default roster |

## Game-day flow

1. `npm run lan` on the host laptop. Note the LAN URL it prints.
2. Cast Chrome on the laptop to the TV; open `/events/new`, pick the roster, hit create.
3. Phones in the room scan the QR code in the broadcast corner → land on `/claim` → tap their wizard portrait.
4. Organizer hits "Start round 1" on `/events/[id]/manage`.
5. Players adjust their own life total / report game wins from their phones; the broadcast view updates in real time.
6. Round timer counts down 50 minutes by default. When matches finish (or organizer overrides via `/manage`), the round can be closed and the next paired automatically.
7. After the final round, ELO is updated, final standings are written, and the event is marked complete.

## Architecture notes

- **Cookies**: each player gets a 192-bit random `joinToken` per event stored in `event_players.join_token`. The `/claim` page sets it via httpOnly cookie scoped to `/events/[id]`. No real auth — friends-only assumption.
- **Real-time**: a single in-process `Map<eventId, Set<controller>>` pubsub. Mutations hit Postgres, then publish a typed event (`life_changed`, `game_complete`, `match_complete`, `round_started`, `round_completed`). Broadcast view holds one EventSource and re-renders accordingly.
- **Wizard tiers**: portraits are generated upfront — fresh (>75% life), wounded (25–75%), critical (≤25%). The broadcast `PlayerSide` calls `pickAvatarUrl` from `src/lib/avatar-tier.ts`, which has a cascading fallback chain so older single-portrait players still render correctly.
- **HEIC handling**: iPhone selfies hit a Sharp pipeline with libheif so they normalize to a 1024×1024 JPEG before going to FLUX `/edit`.

## What this is not

- Not a Wizards-sanctioned tournament tool — house events only, no DCI numbers.
- Not multi-tenant. One organizer, one Neon DB.
- Not a replacement for the MTG Companion app — Companion has no public API; you can keep using it for card lookups.

## License

MIT.
