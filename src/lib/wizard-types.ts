export const WIZARD_ARCHETYPES = [
  "pyromancer",
  "frost mage",
  "druid",
  "necromancer",
  "illusionist",
  "stormcaller",
  "blood mage",
  "archmage",
] as const;

export type WizardArchetype = (typeof WIZARD_ARCHETYPES)[number];

export const LOTR_ARCHETYPES = [
  "hobbit",
  "elf",
  "dwarf",
  "ranger",
  "wizard",
  "rider of Rohan",
  "king of Gondor",
  "Sméagol",
] as const;

export type LotrArchetype = (typeof LOTR_ARCHETYPES)[number];

// A theme is a themed pack of selectable archetypes; the player picks the
// theme first, then a character within it.
export const PORTRAIT_THEMES = ["standard", "lotr"] as const;

export type PortraitTheme = (typeof PORTRAIT_THEMES)[number];

export const PORTRAIT_THEME_LABELS: Record<PortraitTheme, string> = {
  standard: "Standard",
  lotr: "Lord of the Rings",
};

export const THEME_ARCHETYPES: Record<PortraitTheme, readonly string[]> = {
  standard: WIZARD_ARCHETYPES,
  lotr: LOTR_ARCHETYPES,
};

// What the wizardize form pre-selects. Hardcoded to the current draft's set
// for now — TBD whether this later derives from the upcoming event.
export const DEFAULT_PORTRAIT_THEME: PortraitTheme = "lotr";

const THEME_FALLBACK_ARCHETYPE: Record<PortraitTheme, string> = {
  standard: "archmage",
  lotr: "wizard",
};

export function isPortraitTheme(value: unknown): value is PortraitTheme {
  return PORTRAIT_THEMES.includes(value as PortraitTheme);
}

/** Validate a submitted archetype against its theme's pack, with a fallback. */
export function archetypeForTheme(theme: PortraitTheme, raw: string): string {
  return THEME_ARCHETYPES[theme].includes(raw)
    ? raw
    : THEME_FALLBACK_ARCHETYPE[theme];
}
