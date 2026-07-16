# Public roadmap — mtg-dash → multi-league product

> Plan-of-record sketched 2026-07-16, after the Lexington Dads draft-night
> hardening week (PRs #24–#28) and the first external league
> (`san-diego-magic-drafters`, created by DB insert for a friend to trial).
> Goal: let strangers create and run their own leagues without Andrew in the
> loop — without breaking the zero-friction QR/token flow that makes the
> at-home experience good.

## Headline answers

| Concern | Answer |
|---|---|
| What blocks sharing today? | **Two things: no authorization (anyone with a URL can mutate anything, including other leagues) and league creation is a DB insert.** |
| Do players need accounts? | **No — and they never should.** The `league_token` / `join_token` cookie scheme stays as the guest layer; phones at the table keep working via QR with zero login. Accounts are for *organizers*. |
| Does auth mean rewriting identity? | **No.** Accounts sit *above* the existing scheme: a `users` table plus nullable `players.user_id`. Unclaimed wizards behave exactly like today. |
| Is the image-gen Mac dependency a blocker? | **No — it's a config flip.** `IMAGE_GEN_PROVIDER=fal` already exists (~$0.01/portrait, same FLUX.2 Klein checkpoint). An OpenAI `gpt-image-1` provider is a third module behind the same interface if we want it, not a rework. |
| Cost at, say, 50 leagues? | Still ~free. Every metered axis (Neon, Blob, Upstash, Vercel) had 8–10× headroom at 1 league; portraits are the only real marginal cost (~$0.05/player on fal) — rate-limit them. |
| What's the biggest risk? | Wizardize abuse (it costs money per call) and cross-league mischief. Both handled in Phase 0/2. |

## Phase 0 — Guardrails before wider sharing (~1 day) ✅ do first

Cheap protections that don't need accounts, worth shipping before the San
Diego league invites more people:

1. **Flip prod to `IMAGE_GEN_PROVIDER=fal`** (+ `FAL_KEY` in Vercel). Removes
   the sleeping-Mac failure mode for anyone who isn't us.
2. **Rate-limit wizardize** — `@upstash/ratelimit` on `generateWizardAction`
   (per-player and per-league caps). It's the only action that spends money.
3. **Organizer link for manage pages (interim authz).** Same pattern as
   player tokens: `leagues.organizer_token`, checked by a cookie set from
   `/leagues/[slug]/manage/[token]`. Mutating organizer actions
   (`previewNextRoundAction`, `confirmRoundAction`, `setMatchResultAction`,
   `endEventAction`, …) require it. One day of work, deleted in Phase 2 when
   real roles land — but it means "share the site" ≠ "share the admin panel"
   immediately.

## Phase 1 — Accounts (~2–3 days)

- **Email magic-link sign-in.** Recommendation: **Clerk** (Vercel
  marketplace, free to 10k MAU, no password UI to build). Zero-cost
  alternative if we'd rather own it: better-auth with a Resend email
  provider — more code, no vendor.
- Schema: `users` table; `players.user_id uuid null`. Additive migration,
  per house rules.
- **Claiming binds ownership**: claiming a wizard while signed in sets
  `players.user_id`; a bound wizard can only be re-claimed by its owner
  (fixes "anyone can tap anyone's wizard on the claim grid"). Unbound
  wizards keep today's behavior, so casual players never hit a login wall.
- Entry points to touch (all already funnel through `setPlayerCookie` /
  `setLeagueCookie`, per CLAUDE.md): `/leagues/[slug]/claim`,
  `/events/[id]/claim`, `/events/[id]/join/[token]`.

## Phase 2 — League ownership & roles (~2–3 days)

- Schema: `leagues.owner_user_id` + `league_members (league_id, user_id,
  role: owner | organizer)`. Players don't need membership rows — being a
  `players` row *is* playing.
- **Authorization split** (the important design line):
  - *Organizer actions* (pairings, round lifecycle, result overrides,
    roster edits, event create/end) → require owner/organizer membership.
  - *Player actions* (life taps, game winners, draws, seat claims) → keep
    the join-token auth they already have. Mid-game phones must never see a
    login screen.
- Replace the Phase-0 organizer token with real roles; backfill: Andrew owns
  `demo` + `lexington-dads-magic-draft`, friend owns
  `san-diego-magic-drafters`.
- Extend `scripts/verify.ts` with authz assertions (unauthenticated caller
  cannot preview/confirm/override).

## Phase 3 — Self-serve leagues & front door (~1–2 days)

- `/leagues/new` behind sign-in: name → slug picker → done, redirect to the
  claim page with the QR up. Creator becomes owner.
- A real landing page at `/` for signed-out visitors: what it is, screenshot
  of the broadcast view, "Create your league." (Today `/` assumes you're us.)
- Leagues stay **unlisted by default** — knowing the slug is the invite.
  Public directory is a non-goal for now.

## Phase 4 — Image-gen productization (~1 day)

- Keep the provider abstraction in `src/lib/wizard.ts`; add `openai`
  (gpt-image-1) as a third provider only if quality/cost beats fal — the
  interface (selfie in → five tier portraits out → Blob) doesn't change.
- Per-league portrait quota (e.g. N regenerations/player/week) enforced next
  to the Phase-0 rate limit; the counter lives in Redis, not the schema.

## Phase 5 — Strangers-on-the-internet hardening (ongoing)

- Moderation on selfie uploads + display names (OpenAI moderation endpoint
  at upload time; it's one API call in `normalizeSelfie`'s path).
- Deletion path: a league owner can delete players/events; a player can wipe
  their selfie + portraits (Blob delete by the stable
  `avatars/<playerId>/<tier>.jpg` keys). Matters because selfies are
  personal data.
- Error tracking (Sentry) next to the existing GA4.
- Rate limits broadened from wizardize to all mutations (cheap with the
  Phase-0 plumbing).

## Non-goals (explicitly deferred)

- **Portable identities across leagues** — CLAUDE.md already marks this as a
  future migration; accounts make it *possible* later but nothing here
  depends on it.
- Public league directory / social features.
- Payments. If fal costs ever matter, per-league quotas beat billing.
- Native app store presence (see `docs/native-app.md`) — the Capacitor shell
  auto-updates with the web app regardless.

## Sequencing rationale

Each phase ships independently and the guest-token layer is never broken, so
the Lexington and San Diego leagues keep working untouched throughout. Phase
0 is worth doing *now* (it protects the money and the admin surface); Phases
1–3 are the actual "share it widely" unit and only make sense together;
Phases 4–5 harden what usage reveals.
