# Star Trek Wizardize

## Experience

Opening Wizardize or Re-wizardize selects **Star Trek**, with **Jean-Luc Picard** as the fallback character. A previously selected Star Trek character is retained when available. Existing themes remain selectable; changing themes resets the character to a valid choice in that pack.

Ten choices: Jean-Luc Picard, James T. Kirk, Spock, Nyota Uhura, Montgomery Scott, Worf, Data, Seven of Nine, Kathryn Janeway, and Borg drone. These are portrait interpretations, not a claim that every choice appears on a particular card.

A short hint invites players to become a Starfleet officer, Vulcan, Klingon, android, or Borg. Extra-detail examples fit the selected theme. Generation still requires an explicit button press and uses the existing uploaded or saved selfie.

## Portrait direction

Keep the player's likeness, age, facial proportions, hair, and expression. Add recognizable uniforms, equipment, and settings without replacing the player with an actor. Allow only the specified alien or android accents; keep eyes and the central face visible. Maintain the existing painterly shoulders-up style, with family-friendly science-fiction scenery.

All five states (fresh, wounded, critical, victory, defeat) retain the character's outfit. Star Trek state prompts use weathered uniforms, console lighting, and starship atmosphere instead of wizard robes and magical effects.

## Implementation

- Register `star-trek` in the shared theme catalog, character list, fallback, and default.
- Add typed character descriptions and Star Trek identity-preserving prompt handling.
- Add Star Trek state suffixes without changing existing themes' prompts.
- Reuse existing server validation, background generation, saved-selfie reuse, wardrobe labels, storage, and portrait history. No schema or dependency changes.

## Acceptance

- New and returning players initially see Star Trek; a character from an older theme cannot leak into its submitted selection.
- Every listed character validates and produces a distinct prompt; invalid or cross-theme characters fall back to Picard.
- Every state includes the selected character and extra detail, preserves likeness, and avoids wizard robes or magical effects.
- Existing theme tests continue to pass. Verify the real form at desktop and phone widths without submitting a paid generation.

Release verification: [Wizards' Star Trek event guide](https://magic.wizards.com/en/news/feature/where-to-play-star-trek) lists the November 13, 2026 release. UI copy is date-independent.

## Local verification

- All 264 unit tests pass, including all ten Star Trek characters across five states.
- Production build, TypeScript, and lint of changed source files pass.
- The actual `WizardForm` was rendered in a temporary development-only route with fixture props: desktop and 390px phone layouts, theme switching, a returning Reality Fracture player defaulting to Picard, and a returning Spock player keeping Spock. No horizontal overflow or browser warnings/errors were observed. The preview route was removed afterward.
- The phone check exposed a cramped generation button; the footer now stacks at narrow widths and keeps the button label on one line.
- No image provider calls, database mutations, or deployment were performed. Generated portrait quality still needs a real generation review.
