import { describe, expect, it } from "vitest";
import { buildVariantPrompt, buildWizardPrompt } from "./wizard";
import {
  HOBBIT_ARCHETYPES,
  LOTR_ARCHETYPES,
  MARVEL_ARCHETYPES,
  PORTRAIT_THEMES,
  THEME_ARCHETYPES,
  archetypeForTheme,
  isPortraitTheme,
} from "./wizard-types";

describe("buildWizardPrompt — standard theme", () => {
  it("uses the archetype costume clause", () => {
    const prompt = buildWizardPrompt("standard", "pyromancer");
    expect(prompt).toContain("Dress them as a pyromancer");
    expect(prompt).toContain("Keep this exact person");
  });

  it("appends freeform detail", () => {
    const prompt = buildWizardPrompt("standard", "druid", "raven on shoulder");
    expect(prompt).toContain("Also: raven on shoulder.");
  });

  it("falls back to archmage for an unknown archetype", () => {
    const prompt = buildWizardPrompt("standard", "definitely-not-real");
    expect(prompt).toContain("glowing arcane sigils");
  });
});

describe("buildWizardPrompt — lotr theme", () => {
  it("has a transformation clause for every character in the pack", () => {
    for (const character of LOTR_ARCHETYPES) {
      const prompt = buildWizardPrompt("lotr", character);
      expect(prompt).toMatch(/transform (them|this person) into/i);
      expect(prompt).not.toContain("Dress them as a");
      expect(prompt).toContain("painterly oil-painting style");
    }
  });

  it("keeps the strict identity lock for costume characters", () => {
    for (const character of ["hobbit", "orc", "Sméagol"]) {
      const prompt = buildWizardPrompt("lotr", character);
      expect(prompt).toContain("Keep this exact person");
      expect(prompt).toContain("must stay identical");
    }
  });

  it("relaxes the identity lock for full transformations like the ent", () => {
    const prompt = buildWizardPrompt("lotr", "ent");
    // The strict lock overpowers the tree transformation — FLUX errs human —
    // so the ent trades it for a carve-the-likeness instruction.
    expect(prompt).not.toContain("must stay identical");
    expect(prompt).not.toContain("Do not change their face");
    expect(prompt).toContain("stays clearly recognizable");
    expect(prompt).toContain("walking tree-being");
  });

  it("selects the requested character, not a generic description", () => {
    expect(buildWizardPrompt("lotr", "hobbit")).toContain("hobbit of the Shire");
    expect(buildWizardPrompt("lotr", "Sméagol")).toContain("Sméagol");
    expect(buildWizardPrompt("lotr", "dwarf")).toContain("dwarf of Erebor");
    expect(buildWizardPrompt("lotr", "ent")).toContain("ent of Fangorn");
    expect(buildWizardPrompt("lotr", "orc")).toContain("orc of Mordor");
  });

  it("keeps freeform detail alongside the character", () => {
    const prompt = buildWizardPrompt("lotr", "elf", "red beard");
    expect(prompt).toContain("elf of Rivendell");
    expect(prompt).toContain("Also: red beard.");
  });

  it("falls back to the wizard character for an unknown value", () => {
    const prompt = buildWizardPrompt("lotr", "balrog");
    expect(prompt).toContain("wizard of Middle-earth");
  });
});

describe("buildWizardPrompt — marvel theme", () => {
  it("has a transformation clause for every hero in the pack", () => {
    for (const hero of MARVEL_ARCHETYPES) {
      const prompt = buildWizardPrompt("marvel", hero);
      expect(prompt).toMatch(/transform (them|this person) into/i);
      expect(prompt).toContain("painterly oil-painting style");
    }
  });

  it("relaxes the identity lock for the gamma titan's skin change", () => {
    const prompt = buildWizardPrompt("marvel", "gamma titan");
    expect(prompt).not.toContain("must stay identical");
    expect(prompt).toContain("stays clearly recognizable");
    expect(prompt).toContain("green-skinned giant");
  });

  it("selects the requested hero, not a generic description", () => {
    expect(buildWizardPrompt("marvel", "web-slinger")).toContain(
      "web-slinging masked hero"
    );
    expect(buildWizardPrompt("marvel", "thunder god")).toContain(
      "Asgardian thunder god"
    );
  });

  it("falls back to the armored genius for an unknown value", () => {
    const prompt = buildWizardPrompt("marvel", "definitely-not-real");
    expect(prompt).toContain("armored genius inventor");
  });
});

describe("buildWizardPrompt — hobbit theme", () => {
  it("has a transformation clause for every character in the pack", () => {
    for (const character of HOBBIT_ARCHETYPES) {
      const prompt = buildWizardPrompt("hobbit", character);
      expect(prompt).toMatch(/transform (them|this person) into/i);
      expect(prompt).toContain("painterly oil-painting style");
    }
  });

  it("keeps the strict identity lock for costume characters", () => {
    for (const character of [
      "hobbit burglar",
      "goblin of the Misty Mountains",
    ]) {
      const prompt = buildWizardPrompt("hobbit", character);
      expect(prompt).toContain("Keep this exact person");
      expect(prompt).toContain("must stay identical");
    }
  });

  it("relaxes the identity lock for full transformations", () => {
    for (const character of [
      "giant spider",
      "mountain troll",
      "skin-changer",
      "dragon of the Lonely Mountain",
    ]) {
      const prompt = buildWizardPrompt("hobbit", character);
      expect(prompt).not.toContain("must stay identical");
      expect(prompt).toContain("stays clearly recognizable");
    }
  });

  it("selects the requested character, not a generic description", () => {
    expect(buildWizardPrompt("hobbit", "goblin of the Misty Mountains")).toContain(
      "goblin of the Misty Mountains"
    );
    expect(buildWizardPrompt("hobbit", "giant spider")).toContain(
      "many-legged spider-being"
    );
  });

  it("falls back to the hobbit burglar for an unknown value", () => {
    const prompt = buildWizardPrompt("hobbit", "balrog");
    expect(prompt).toContain("hobbit burglar of Bag End");
  });
});

describe("buildVariantPrompt", () => {
  it("threads the theme through to tier variants", () => {
    const prompt = buildVariantPrompt("lotr", "hobbit", undefined, "victory");
    expect(prompt).toContain("hobbit of the Shire");
    expect(prompt).toContain("won the duel");
  });
});

describe("theme helpers", () => {
  it("isPortraitTheme accepts only known themes", () => {
    expect(isPortraitTheme("lotr")).toBe(true);
    expect(isPortraitTheme("standard")).toBe(true);
    expect(isPortraitTheme("marvel")).toBe(true);
    expect(isPortraitTheme("hobbit")).toBe(true);
    expect(isPortraitTheme("starwars")).toBe(false);
    expect(isPortraitTheme("")).toBe(false);
  });

  it("archetypeForTheme validates against the right pack", () => {
    expect(archetypeForTheme("lotr", "Sméagol")).toBe("Sméagol");
    expect(archetypeForTheme("lotr", "pyromancer")).toBe("wizard");
    expect(archetypeForTheme("standard", "pyromancer")).toBe("pyromancer");
    expect(archetypeForTheme("standard", "hobbit")).toBe("archmage");
    expect(archetypeForTheme("marvel", "thunder god")).toBe("thunder god");
    expect(archetypeForTheme("marvel", "pyromancer")).toBe("armored genius");
    expect(archetypeForTheme("hobbit", "giant spider")).toBe("giant spider");
    expect(archetypeForTheme("hobbit", "orc")).toBe("hobbit burglar");
  });

  it("every pack member produces a distinct prompt", () => {
    for (const theme of PORTRAIT_THEMES) {
      const prompts = THEME_ARCHETYPES[theme].map((a) =>
        buildWizardPrompt(theme, a)
      );
      expect(new Set(prompts).size).toBe(prompts.length);
    }
  });
});
