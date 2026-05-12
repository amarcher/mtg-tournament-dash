import { describe, it, expect } from "vitest";
import {
  pickAvatarUrl,
  pickMatchOutcomeAvatar,
  tierForLife,
  type AvatarTiers,
} from "./avatar-tier";

const all: AvatarTiers = {
  fresh: "F",
  wounded: "W",
  critical: "C",
  victory: "V",
  defeat: "D",
};
const onlyFresh: AvatarTiers = {
  fresh: "F",
  wounded: null,
  critical: null,
  victory: null,
  defeat: null,
};
const noWounded: AvatarTiers = {
  fresh: "F",
  wounded: null,
  critical: "C",
  victory: null,
  defeat: null,
};
const empty: AvatarTiers = {
  fresh: null,
  wounded: null,
  critical: null,
  victory: null,
  defeat: null,
};

describe("tierForLife", () => {
  it("full life → fresh", () => {
    expect(tierForLife(20, 20)).toBe("fresh");
  });
  it("just above 75% → fresh", () => {
    expect(tierForLife(16, 20)).toBe("fresh");
  });
  it("75% boundary → wounded (≤ rule)", () => {
    expect(tierForLife(15, 20)).toBe("wounded");
  });
  it("middle → wounded", () => {
    expect(tierForLife(10, 20)).toBe("wounded");
  });
  it("just above 25% → wounded", () => {
    expect(tierForLife(6, 20)).toBe("wounded");
  });
  it("25% boundary → critical (≤ rule)", () => {
    expect(tierForLife(5, 20)).toBe("critical");
  });
  it("low life → critical", () => {
    expect(tierForLife(2, 20)).toBe("critical");
  });
  it("zero life → critical", () => {
    expect(tierForLife(0, 20)).toBe("critical");
  });
  it("negative life → critical", () => {
    expect(tierForLife(-3, 20)).toBe("critical");
  });
  it("zero startingLife treated as fresh (no division-by-zero)", () => {
    expect(tierForLife(20, 0)).toBe("fresh");
  });
  it("commander 40 → tiers scale", () => {
    expect(tierForLife(31, 40)).toBe("fresh"); // 0.775 → fresh
    expect(tierForLife(30, 40)).toBe("wounded"); // 0.75 → wounded (boundary)
    expect(tierForLife(11, 40)).toBe("wounded"); // 0.275 → wounded
    expect(tierForLife(10, 40)).toBe("critical"); // 0.25 → critical (boundary)
  });
});

describe("pickAvatarUrl — happy path with all tiers present", () => {
  it("fresh range picks fresh", () => {
    expect(pickAvatarUrl(20, 20, all)).toBe("F");
  });
  it("wounded range picks wounded", () => {
    expect(pickAvatarUrl(10, 20, all)).toBe("W");
  });
  it("critical range picks critical", () => {
    expect(pickAvatarUrl(2, 20, all)).toBe("C");
  });
});

describe("pickAvatarUrl — fallback chain", () => {
  it("only fresh available → fresh used at every tier", () => {
    expect(pickAvatarUrl(20, 20, onlyFresh)).toBe("F");
    expect(pickAvatarUrl(10, 20, onlyFresh)).toBe("F");
    expect(pickAvatarUrl(2, 20, onlyFresh)).toBe("F");
  });
  it("missing wounded but critical present → critical at low life, fresh at mid", () => {
    expect(pickAvatarUrl(2, 20, noWounded)).toBe("C");
    expect(pickAvatarUrl(10, 20, noWounded)).toBe("F"); // wounded missing → fresh
  });
  it("nothing available → null", () => {
    expect(pickAvatarUrl(20, 20, empty)).toBeNull();
    expect(pickAvatarUrl(10, 20, empty)).toBeNull();
    expect(pickAvatarUrl(2, 20, empty)).toBeNull();
  });
});

describe("pickMatchOutcomeAvatar", () => {
  it("won picks victory", () => {
    expect(pickMatchOutcomeAvatar("won", all)).toBe("V");
  });
  it("lost picks defeat", () => {
    expect(pickMatchOutcomeAvatar("lost", all)).toBe("D");
  });
  it("won without victory falls back to fresh", () => {
    expect(pickMatchOutcomeAvatar("won", noWounded)).toBe("F");
  });
  it("lost without defeat falls back through critical → wounded → fresh", () => {
    expect(pickMatchOutcomeAvatar("lost", noWounded)).toBe("C");
    expect(pickMatchOutcomeAvatar("lost", onlyFresh)).toBe("F");
  });
  it("empty → null", () => {
    expect(pickMatchOutcomeAvatar("won", empty)).toBeNull();
    expect(pickMatchOutcomeAvatar("lost", empty)).toBeNull();
  });
});
