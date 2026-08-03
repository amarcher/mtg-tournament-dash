import { describe, expect, it } from "vitest";
import { buildVariantPrompt, buildWizardPrompt } from "./wizard";
import {
  LOTR_ARCHETYPES,
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
      expect(prompt).toContain("Transform them into");
      expect(prompt).not.toContain("Dress them as a");
      // Identity lock and style survive the theme swap.
      expect(prompt).toContain("Keep this exact person");
      expect(prompt).toContain("painterly oil-painting style");
    }
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
    expect(isPortraitTheme("starwars")).toBe(false);
    expect(isPortraitTheme("")).toBe(false);
  });

  it("archetypeForTheme validates against the right pack", () => {
    expect(archetypeForTheme("lotr", "Sméagol")).toBe("Sméagol");
    expect(archetypeForTheme("lotr", "pyromancer")).toBe("wizard");
    expect(archetypeForTheme("standard", "pyromancer")).toBe("pyromancer");
    expect(archetypeForTheme("standard", "hobbit")).toBe("archmage");
  });

  it("every pack member produces a distinct prompt", () => {
    for (const theme of ["standard", "lotr"] as const) {
      const prompts = THEME_ARCHETYPES[theme].map((a) =>
        buildWizardPrompt(theme, a)
      );
      expect(new Set(prompts).size).toBe(prompts.length);
    }
  });
});
