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

> **Status 2026-07-16:** Phases 0–3 shipped in one condensed "lightweight
> public sharing" build (branch `feat/organizer-accounts`), with two
> deliberate deviations: the fal flip (0.1) is still deferred — it had issues
> when last tried and needs a retest — and the organizer token is **kept
> permanently** alongside roles rather than deleted in Phase 2 (it's the
> no-login escape hatch, and the only admin path that works inside the
> Capacitor shell). Auth is better-auth + Resend magic links (not Clerk);
> manager invites are shareable links, not emails. Player→user binding
> (Phase 1's `players.user_id`) was consciously skipped: players never need
> accounts, claiming stays trust-based.

## Phase 0 — Guardrails before wider sharing (~1 day) ✅ do first

Cheap protections that don't need accounts, worth shipping before the San
Diego league invites more people:

1. **Flip prod to `IMAGE_GEN_PROVIDER=fal`** (+ `FAL_KEY` in Vercel). Removes
   the sleeping-Mac failure mode for anyone who isn't us. *(Still deferred —
   retest fal first.)*
2. ✅ **Rate-limit wizardize** — `@upstash/ratelimit` on `generateWizardAction`
   (per-player 3/h and per-league 30/d caps, `src/lib/rate-limit.ts`). It's
   the only action that spends money.
3. ✅ **Organizer link for manage pages (interim authz).** Same pattern as
   player tokens: `leagues.organizer_token`, checked by a cookie set from
   `/leagues/[slug]/manage/[token]`. All 17 mutating organizer actions
   require it (or a manager session). Kept permanently as the no-login
   escape hatch, not deleted in Phase 2 — rotate it from league settings to
   revoke every outstanding link/cookie.

## Phase 1 — Accounts (~2–3 days) ✅ shipped (better-auth variant)

- ✅ **Email magic-link sign-in** via **better-auth + Resend** (chose the
  own-it path over Clerk): `src/lib/user-auth.ts`, `/sign-in`,
  `/api/auth/[...all]`. Auth tables generated into `src/db/auth-schema.ts`
  (`transaction: false` on the drizzle adapter — neon-http has no
  transactions). Without `RESEND_API_KEY` the magic link logs to the server
  console, so local dev needs no email at all.
- ⏭️ `players.user_id` binding skipped on purpose — accounts are for
  organizers only; wizard claiming stays trust-based. Revisit only if
  cross-league identity ever lands.

## Phase 2 — League ownership & roles (~2–3 days) ✅ shipped

- ✅ Schema: `leagues.owner_user_id` + `league_members (league_id, user_id,
  role: owner | organizer)`. Players don't need membership rows — being a
  `players` row *is* playing.
- ✅ **Authorization split** (the important design line), enforced by
  `src/lib/authz.ts` / `authz-core.ts`:
  - *Organizer actions* (pairings, round lifecycle, result overrides,
    roster edits, event create/end) → require owner/organizer membership
    **or** the organizer-token cookie.
  - *Player actions* (life taps, game winners, draws, seat claims, poll
    create/vote/finalize) → keep the guest-token auth they already have.
    Mid-game phones never see a login screen.
- ✅ Roles coexist with (not replace) the Phase-0 token. Manager invites are
  a shareable rotatable link: `/leagues/[slug]/invite/[token]` → sign in →
  organizer membership. Backfill: Andrew signs in, then one-off SQL sets
  `owner_user_id` for `demo` + `lexington-dads-magic-draft`; the friend gets
  an invite link for `san-diego-magic-drafters`.
- ✅ `scripts/verify.ts` authz assertions: gated pages deny cookieless HTTP
  (and leak no join tokens), the organizer cookie unlocks them, and the
  in-process no-request-scope allowance keeps the harness driving actions.

## Phase 3 — Self-serve leagues & front door (~1–2 days) ✅ shipped

- ✅ `/leagues/new` behind sign-in: name → slug picker → done. Creator
  becomes owner; organizer + invite tokens minted at creation.
- ✅ Landing page at `/` for signed-out visitors, plus "leagues you manage"
  (session) and "leagues you play in" (guest cookies) sections. The old
  list-every-league-to-anyone front door and its single-league auto-redirect
  are gone.
- ✅ Leagues stay **unlisted by default** — knowing the slug is the invite.
  Public directory is a non-goal for now. League settings
  (`/leagues/[slug]/settings`) holds the member list and both share links
  with QRs.

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
