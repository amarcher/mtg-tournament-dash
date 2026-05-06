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
