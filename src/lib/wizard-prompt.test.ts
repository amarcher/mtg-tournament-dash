import { describe, expect, it } from "vitest";
import { buildVariantPrompt, buildWizardPrompt } from "./wizard";

describe("buildWizardPrompt", () => {
  it("uses the archetype costume clause by default", () => {
    const prompt = buildWizardPrompt("pyromancer");
    expect(prompt).toContain("Dress them as a pyromancer");
    expect(prompt).toContain("Keep this exact person");
  });

  it("appends freeform detail", () => {
    const prompt = buildWizardPrompt("druid", "raven on shoulder");
    expect(prompt).toContain("Also: raven on shoulder.");
  });

  it("replaces the archetype clause when a theme is set", () => {
    const prompt = buildWizardPrompt(
      "archmage",
      undefined,
      "a character from The Lord of the Rings"
    );
    expect(prompt).toContain(
      "Transform them into a character from The Lord of the Rings."
    );
    expect(prompt).not.toContain("Dress them as a");
    // Identity lock and style survive the theme swap.
    expect(prompt).toContain("Keep this exact person");
    expect(prompt).toContain("painterly oil-painting style");
  });

  it("keeps freeform detail alongside a theme", () => {
    const prompt = buildWizardPrompt("archmage", "red beard", "an elf ranger");
    expect(prompt).toContain("Transform them into an elf ranger.");
    expect(prompt).toContain("Also: red beard.");
  });

  it("ignores a blank theme", () => {
    const prompt = buildWizardPrompt("archmage", undefined, "   ");
    expect(prompt).toContain("Dress them as a archmage");
  });
});

describe("buildVariantPrompt", () => {
  it("threads the theme through to tier variants", () => {
    const prompt = buildVariantPrompt(
      "archmage",
      undefined,
      "victory",
      "a hobbit of the Shire"
    );
    expect(prompt).toContain("Transform them into a hobbit of the Shire.");
    expect(prompt).toContain("won the duel");
  });
});
