@AGENTS.md

# Working in this repo

This is a Next.js 16 App Router app for hosting Magic: The Gathering tournaments at home. It runs against Neon Postgres via Drizzle, talks to a local FLUX.2 Klein image-edit server at `http://127.0.0.1:8000` for wizard portrait generation, and uses Server-Sent Events for real-time fan-out. The full architecture is in `README.md`; the original implementation plan and feature addenda live at `~/.claude/plans/i-m-interested-in-hosting-keen-hejlsberg.md`.

## Verification gate

Before reporting any non-trivial change as done, run **all four**:

```sh
npm test            # unit tests (Swiss, ELO, avatar tier picker) — must stay ≥36 passing
npm run lint        # ESLint
npm run build       # production build (catches RSC/client-boundary issues lint misses)
npm run verify      # end-to-end harness — see scripts/verify.ts
```

`npm run verify` spins up an isolated `_verify_`-prefixed 8-player tournament, drives every server action, exercises the FLUX wizardize pipeline if the local image-gen server is up (~50 s total) or skips it gracefully (~6 s), then cleans up. Use `SKIP_FLUX=1` to skip the image-gen step. Idempotent — re-running after a crashed run wipes leftovers automatically.

## Conventions

- **Server actions** live in `src/app/events/actions.ts`. The file is `"use server"`, so it can only export async functions. Constants must live in non-`"use server"` modules — see `src/lib/wizard-types.ts` next to `src/lib/wizard.ts` for the established split when a constant has to be shared between client and server code.
- **Client/server boundary**: anything importing `node:fs/promises`, `sharp`, or talking to FLUX must not be reachable from a Client Component. Pull constants/types into a separate `*-types.ts` module if both sides need them.
- **DB access**: use the typed query helpers in `src/db/queries.ts` rather than ad-hoc Drizzle in components. Three roster-shaped queries already return `avatarUrl` / `avatarWoundedUrl` / `avatarCriticalUrl` — extend them rather than duplicating the joins.
- **Real-time**: every mutation that changes user-visible state should `publish(eventId, ...)` from `src/lib/pubsub.ts` so the broadcast view + phone views update without a refresh. The `EventMessage` union is the contract.
- **Don't add comments** that explain *what* code does — names should already do that. Comments are for the *why* (a non-obvious constraint, a workaround, a reason a hot path is structured oddly).
- **Don't add backwards-compat shims** when you can just change the call sites. The codebase is small.

## What not to break

- The `setPlayerCookie` / `getCurrentPlayer` cookie scheme in `src/lib/auth.ts`. The `/events/[id]/join/[token]` route, the `/events/[id]/claim` page, and any future identity entry point all funnel into it.
- The `pickAvatarUrl` cascading fallback in `src/lib/avatar-tier.ts`. Players who only have a single `avatarUrl` (uploaded before the tiered system existed) still need to render correctly.
- The `revalidatePath` wrapper at the top of `src/app/events/actions.ts` — it intentionally swallows `revalidatePath` errors so the verify script can drive server actions outside a request scope. Don't replace it with the raw `next/cache` import.

## When changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` (creates a numbered SQL file under `drizzle/`).
3. `npm run db:migrate` (applies to Neon).
4. Update the relevant query helpers in `src/db/queries.ts` to thread new columns through.
5. Migrations are additive only — never drop or rename a column without an explicit user request.

## When adding a new entry point that touches identity

The current entry points are: `/events/[id]/claim` (primary), `/events/[id]/join/[token]` (fallback), `/players/[id]` regen pages. Any new one should still call `setPlayerCookie(eventId, joinToken)` — that's the single place identity gets bound to a session.

## When adding a new server action

1. Add to `src/app/events/actions.ts` as an async export.
2. Validate inputs at the top, throwing `Error` with a user-facing message on failure.
3. Mutate the DB.
4. Publish a typed `EventMessage` if any view should re-render in response.
5. Call `revalidatePath` for any page route whose data changed.
6. Add coverage to `scripts/verify.ts` so the action is exercised end-to-end.

## Running the LAN demo

`npm run lan` on the host machine builds + serves on `0.0.0.0:3002` and prints the LAN URL. macOS may prompt to allow incoming connections — accept. Phones on the same Wi-Fi can then scan the QR code in the broadcast corner to land on the claim page without typing the IP.
