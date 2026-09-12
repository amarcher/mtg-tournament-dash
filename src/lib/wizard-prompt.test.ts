import { describe, expect, it } from "vitest";
import { buildVariantPrompt, buildWizardPrompt } from "./wizard";
import {
  HOBBIT_ARCHETYPES,
  DEFAULT_PORTRAIT_THEME,
  TMNT_ARCHETYPES,
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
      "orc raider",
      "warg-rider",
      "Gollum, Riddle Master",
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
      "giant eagle",
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
    expect(buildWizardPrompt("hobbit", "bard of Lake-town")).toContain(
      "bard of Lake-town"
    );
    expect(buildWizardPrompt("hobbit", "Gollum, Riddle Master")).toContain(
      "Riddle Master"
    );
    expect(buildWizardPrompt("hobbit", "giant eagle")).toContain(
      "Great Eagle"
    );
    expect(buildWizardPrompt("hobbit", "orc raider")).toContain(
      "orc raider of Gundabad"
    );
    expect(buildWizardPrompt("hobbit", "warg-rider")).toContain(
      "goblin warg-rider"
    );
  });

  it("falls back to the hobbit burglar for an unknown value", () => {
    const prompt = buildWizardPrompt("hobbit", "balrog");
    expect(prompt).toContain("hobbit burglar of Bag End");
  });
});

describe("TMNT portraits", () => {
  it("defaults new generations to TMNT and accepts every character", () => {
    expect(DEFAULT_PORTRAIT_THEME).toBe("tmnt");
    expect(isPortraitTheme("tmnt")).toBe(true);
    for (const character of TMNT_ARCHETYPES) {
      expect(archetypeForTheme("tmnt", character)).toBe(character);
      expect(buildWizardPrompt("tmnt", character)).toContain(character);
    }
    expect(archetypeForTheme("tmnt", "hobbit burglar")).toBe("Leonardo");
    expect(buildWizardPrompt("tmnt", "unknown")).toBe(
      buildWizardPrompt("tmnt", "Leonardo")
    );
  });

  it.each([
    ["Leonardo", "blue eye mask", "katana"],
    ["Raphael", "red eye mask", "sai"],
    ["Donatello", "purple eye mask", "bo staff"],
    ["Michelangelo", "orange eye mask", "nunchaku"],
  ])("gives %s their signature color and weapon", (character, mask, weapon) => {
    const prompt = buildWizardPrompt("tmnt", character);
    expect(prompt).toContain(mask);
    expect(prompt).toContain(weapon);
    expect(prompt).toContain("shell");
  });

  it("preserves human facial identity for every Turtle across all life states", () => {
    for (const character of ["Leonardo", "Raphael", "Donatello", "Michelangelo"]) {
      for (const tier of ["fresh", "wounded", "critical", "victory", "defeat"] as const) {
        const prompt = buildVariantPrompt("tmnt", character, "gold trim", tier);
        expect(prompt).toContain("Keep this exact person from the reference photo");
        expect(prompt).toContain("Preserve their human face shape");
        expect(prompt).toContain("beard or facial hair");
        expect(prompt).toContain("Dress this person in");
        expect(prompt).toContain("Also: gold trim.");
        expect(prompt).not.toContain("Fully transform");
        expect(prompt).not.toContain("a broad turtle muzzle");
        expect(prompt).not.toContain("a green mutant turtle");
      }
    }
  });

  it("allows mutant faces while retaining the player's likeness", () => {
    for (const character of ["Splinter", "Bebop", "Rocksteady"]) {
      const prompt = buildWizardPrompt("tmnt", character);
      expect(prompt).toContain("stays clearly recognizable");
      expect(prompt).not.toContain("must stay identical");
      expect(prompt).toContain("Family-friendly");
    }
    for (const character of ["April O'Neil", "Shredder", "Casey Jones"]) {
      expect(buildWizardPrompt("tmnt", character)).toContain("must stay identical");
    }
  });

  it("frames Krang's likeness in the belly cockpit across all life states", () => {
    for (const tier of ["fresh", "wounded", "critical", "victory", "defeat"] as const) {
      const prompt = buildVariantPrompt("tmnt", "Krang", "green lights", tier);
      expect(prompt).toContain("Close-up portrait of the person's face inside the android belly cockpit");
      expect(prompt).not.toContain("Shoulders-up portrait");
      expect(prompt).toContain("Preserve their human face shape");
      expect(prompt).toContain("beard or facial hair");
      expect(prompt).toContain("folds confined to the surround outside their face and hair");
      expect(prompt).not.toContain("Fully transform");
      expect(prompt).not.toContain("living pink brain-being");
      expect(prompt).toContain("Also: green lights.");
    }
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
