# MTG Dash UX Audit

Date: 2026-05-24

## Summary

Broadcast mode is the strongest experience in the app: it has a clear audience, focused visual hierarchy, and an obvious job on game night. The rest of the site works, but it feels like a collection of useful pages rather than a navigable product. The biggest opportunity is to create a persistent information architecture around three roles:

- Organizer: create events, manage rounds, share links, finish tournaments.
- Player: claim identity, open scorekeeper, update portrait, view results.
- Spectator/TV: broadcast and final rankings.

The app already has most of the needed destinations. The rough edge is wayfinding between them.

## Priority Findings

### P0 - Add A Persistent Navigation Frame

Most pages only expose a single contextual back link. Examples: league page actions live in the header at `src/app/leagues/[slug]/page.tsx:37`, event management starts with a back link plus isolated buttons at `src/app/events/[id]/manage/page.tsx:108`, and scorekeeper points all the way back to `/` at `src/app/events/[id]/play/PlayClient.tsx:208`.

Recommended fix:

- Add an app shell for normal pages with `League`, `Events`, `Players`, and `Current Match`/`Manage Event` shortcuts when context exists.
- Keep broadcast mode outside the shell because it is intentionally full-screen.
- On event pages, use event-scoped tabs or segmented navigation: `Manage`, `Claim`, `Broadcast`, `Standings`.
- On player pages, keep league context visible and link back to open events directly.

Expected impact: users stop needing to remember URLs or retreat to the homepage to recover.

### P0 - Make The League Page An Actual Dashboard

The league page is currently the closest thing to a home base, but it mixes active events, leaderboard, and past events without a clear primary task. Active event rows offer only `Manage` and `Broadcast` at `src/app/leagues/[slug]/page.tsx:117`; players only see scorekeeper if they have a cookie and are in an open event at `src/app/leagues/[slug]/page.tsx:69`.

Recommended fix:

- Split the top of the page into role-based action areas: `Organizer`, `Player`, `History`.
- For each active event, show status, current round, incomplete match count, and primary next action.
- Add `Claim/Join` and `Scorekeeper` affordances on active event rows where applicable.
- Add “View results” for completed events instead of sending past event links to `manage`.

Expected impact: the page becomes the obvious “where do I go now?” surface.

### P1 - Rework Event Management Into A Stepper

The manage page contains the right tools, but the flow reads as a stack of controls: open broadcast, open claim, preview/complete round, join links, pairings, standings. In the live active event, the disabled complete button is near the top but the reason is only in its text/title at `src/app/events/[id]/manage/page.tsx:150`; result buttons are lower on the page at `src/app/events/[id]/manage/page.tsx:621`.

Recommended fix:

- Use a tournament progress stepper: `1. Share Join Links`, `2. Preview Pairings`, `3. Run Round`, `4. Close Round`, `5. Final Results`.
- Pin the current blocking action near the top, e.g. “1 match needs a result” with direct anchor to the match row.
- Move join links behind a collapsible/share panel once the event is active.
- Make `Broadcast` and `Claim` persistent event utilities, not equal-weight workflow buttons.

Expected impact: organizers can scan the page under game-night pressure.

### P1 - Fix Mobile Organizer Layout

At 390px wide, the manage page join-link code chips overflow/truncate awkwardly and the match result actions wrap unevenly. The offending row is a single flex line with avatar, player link, code, and QR at `src/app/events/[id]/manage/page.tsx:176`.

Recommended fix:

- On mobile, render join links as one card per player with player name, QR, and a copy/share button.
- Hide raw join URLs by default; expose “Copy link” and “Show URL”.
- Make result actions a full-width vertical button group on small screens.
- Add horizontal overflow protection to standings or switch mobile standings to compact cards.

Expected impact: the organizer surface becomes usable from a phone, not just a laptop.

### P1 - Clarify Claiming Versus Editing A Wizard

The claim cards are visually strong, but the top-right `↺` rewizardize link sits directly on every claim card at `src/app/leagues/[slug]/claim/page.tsx:142` and `src/app/events/[id]/claim/page.tsx:144`. That makes a secondary/destructive-feeling action compete with the primary action: “tap your wizard to claim.”

Recommended fix:

- Move rewizardize into the player page, a long-press/context menu, or a small “Edit” text link below the claimed player banner.
- On claim pages, prioritize only `Claim`, `Continue as`, and `Switch player`.
- If the badge remains, add a tooltip/label visible enough to distinguish “edit portrait” from “claim.”

Expected impact: fewer accidental exits from the join flow.

### P1 - Make Scorekeeper Contextual

The scorekeeper’s top navigation points to `Home` at `src/app/events/[id]/play/PlayClient.tsx:208`, and unauthenticated/waiting states use the same generic home link at `src/app/events/[id]/play/page.tsx:18`. This loses event and league context.

Recommended fix:

- Replace `Home` with event-aware navigation: `Event`, `League`, and possibly `Switch Player`.
- Show event name and round/table in the active scorekeeper header.
- Keep “Swap portrait” secondary; it is useful, but not part of scoring.
- Add confirmation for game-win actions, or an undo window, because `I won this game` and `They won` finalize meaningful state at `src/app/events/[id]/play/PlayClient.tsx:267`.

Expected impact: players can recover from the wrong identity/event and avoid accidental reports.

### P2 - Improve Form Accessibility And Completion

Several form controls have visible text nearby but no associated `htmlFor`/`id`, and some inputs rely on placeholders. Examples: new event inputs at `src/app/leagues/[slug]/events/new/page.tsx:66`, `:79`, `:92`; add-player input at `:38`; league claim input at `src/app/leagues/[slug]/claim/page.tsx:79`; wizard form controls at `src/app/players/[id]/WizardForm.tsx:87`.

Recommended fix:

- Add `id` and `htmlFor` pairs to all labels and controls.
- Add `autocomplete="off"` to event names and non-person fields.
- Use placeholders ending in ellipses where they represent examples.
- Add `inputMode="numeric"` to mobile numeric fields.
- Use inline validation/error placement for server action failures where possible.

Expected impact: better screen-reader support, larger label hit targets, and cleaner mobile input behavior.

### P2 - Add Explicit Focus States To Links And Buttons

Many interactive elements have hover states but no `focus-visible` styling, for example league action links at `src/app/leagues/[slug]/page.tsx:53`, event buttons at `src/app/events/[id]/manage/page.tsx:126`, and scorekeeper buttons at `src/app/events/[id]/play/PlayClient.tsx:267`.

Recommended fix:

- Create a shared button/link class or component with `focus-visible:ring-*`.
- Apply it consistently to cards, icon buttons, nav links, form buttons, and scorekeeper controls.
- Preserve the strong touch targets already present in scorekeeper.

Expected impact: keyboard navigation and accessibility become much more reliable.

### P2 - Make Dates And Numbers Locale-Stable

Past events use `toLocaleDateString()` directly at `src/app/leagues/[slug]/page.tsx:213`. The app also displays standings and records with plain string formatting across several pages.

Recommended fix:

- Centralize date formatting with `Intl.DateTimeFormat`.
- Centralize record/ELO/tiebreaker formatting with `Intl.NumberFormat`.
- Use tabular numbers for standings and side-by-side comparisons.

Expected impact: fewer hydration/locale surprises and more consistent tables.

## Suggested Roadmap

1. Add persistent normal-page navigation and event-scoped tabs.
2. Redesign league home as the app dashboard.
3. Reframe manage page as a tournament stepper and fix mobile layouts.
4. Simplify claim pages by removing portrait-edit affordances from primary claim cards.
5. Add shared accessible control styles and label all form controls.

## Verification Notes

- Ran the app locally on `http://localhost:3001`.
- Reviewed desktop league, manage, claim, new event, and broadcast pages.
- Reviewed mobile viewport at 390 x 844 for league, manage, claim, new event, and broadcast pages.
- Ran `npm run lint`; no lint errors.
