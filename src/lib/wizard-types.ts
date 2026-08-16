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
  "ent",
  "orc",
  "Sméagol",
] as const;

export type LotrArchetype = (typeof LOTR_ARCHETYPES)[number];

// Power-set archetypes rather than literal character names — mirrors how the
// standard pack uses "pyromancer" instead of a specific named wizard — for
// the hero types well represented in the Marvel set.
export const MARVEL_ARCHETYPES = [
  "web-slinger",
  "armored genius",
  "super soldier",
  "thunder god",
  "gamma titan",
  "master of the mystic arts",
  "master assassin",
  "clawed mutant",
  "weather witch",
  "cosmic guardian",
] as const;

export type MarvelArchetype = (typeof MARVEL_ARCHETYPES)[number];

// The Hobbit adds Mirkwood's giant spiders and keeps orcs alongside goblins
// (the real set treats them as distinct tribes); it predates the Ents
// joining the story, so no ent here.
export const HOBBIT_ARCHETYPES = [
  "hobbit burglar",
  "dwarf of the Company",
  "grey wizard",
  "elf of Mirkwood",
  "bard of Lake-town",
  "goblin of the Misty Mountains",
  "orc raider",
  "warg-rider",
  "Gollum, Riddle Master",
  "giant spider",
  "mountain troll",
  "skin-changer",
  "giant eagle",
  "dragon of the Lonely Mountain",
] as const;

export type HobbitArchetype = (typeof HOBBIT_ARCHETYPES)[number];

// A theme is a themed pack of selectable archetypes; the player picks the
// theme first, then a character within it.
export const PORTRAIT_THEMES = ["standard", "lotr", "marvel", "hobbit"] as const;

export type PortraitTheme = (typeof PORTRAIT_THEMES)[number];

export const PORTRAIT_THEME_LABELS: Record<PortraitTheme, string> = {
  standard: "Standard",
  lotr: "Lord of the Rings",
  marvel: "Marvel Super Heroes",
  hobbit: "The Hobbit",
};

export const THEME_ARCHETYPES: Record<PortraitTheme, readonly string[]> = {
  standard: WIZARD_ARCHETYPES,
  lotr: LOTR_ARCHETYPES,
  marvel: MARVEL_ARCHETYPES,
  hobbit: HOBBIT_ARCHETYPES,
};

// What the wizardize form pre-selects. Hardcoded to the current draft's set
// for now — TBD whether this later derives from the upcoming event. Set to
// The Hobbit for the "Hobbit-ual Drafters" draft night (Aug 17).
export const DEFAULT_PORTRAIT_THEME: PortraitTheme = "hobbit";

export const THEME_FALLBACK_ARCHETYPE: Record<PortraitTheme, string> = {
  standard: "archmage",
  lotr: "wizard",
  marvel: "armored genius",
  hobbit: "hobbit burglar",
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
