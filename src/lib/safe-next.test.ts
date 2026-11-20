import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("accepts paths on this site", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/leagues/dads/claim?event=1#top")).toBe(
      "/leagues/dads/claim?event=1#top"
    );
    expect(safeNextPath("  /events/1/claim ")).toBe("/events/1/claim");
  });

  it("rejects anything a browser would resolve off-site", () => {
    for (const bad of [
      "",
      null,
      undefined,
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/\t/evil.test",
      "/\n/evil.test",
      "/ok\\..\\evil",
      "evil.test",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});
