import { describe, expect, it } from "vitest";
import {
  claimDecision,
  createDecision,
  ownerAllows,
  parseClaimPolicy,
} from "./wizard-ownership";

const base = {
  playerId: "p1",
  ownerUserId: null,
  sessionUserId: null,
  ownedPlayerId: null,
} as const;

describe("claimDecision", () => {
  it("keeps the no-login tap for an unowned wizard in an open league", () => {
    expect(claimDecision({ ...base, policy: "anyone" })).toEqual({
      ok: true,
      takeOwnership: false,
    });
  });
  it("never hands ownership out in an open league, even to a signed-in tap", () => {
    expect(
      claimDecision({ ...base, policy: "anyone", sessionUserId: "u1" })
    ).toEqual({ ok: true, takeOwnership: false });
  });
  it("locks an owned wizard to its owner under every policy", () => {
    for (const policy of ["anyone", "members", "organizer"] as const) {
      const owned = { ...base, policy, ownerUserId: "u1" };
      expect(claimDecision({ ...owned, sessionUserId: "u1" })).toEqual({
        ok: true,
        takeOwnership: false,
      });
      expect(claimDecision({ ...owned, sessionUserId: "u2" })).toEqual({
        ok: false,
        reason: "taken",
      });
      expect(claimDecision(owned)).toEqual({ ok: false, reason: "sign_in" });
    }
  });
  it("lets a signed-in member take an unowned wizard once", () => {
    const members = { ...base, policy: "members" } as const;
    expect(claimDecision(members)).toEqual({ ok: false, reason: "sign_in" });
    expect(claimDecision({ ...members, sessionUserId: "u1" })).toEqual({
      ok: true,
      takeOwnership: true,
    });
    expect(
      claimDecision({ ...members, sessionUserId: "u1", ownedPlayerId: "p2" })
    ).toEqual({ ok: false, reason: "has_wizard" });
  });
  it("treats unowned wizards as guests when the organizer hands them out", () => {
    expect(
      claimDecision({ ...base, policy: "organizer", sessionUserId: "u1" })
    ).toEqual({ ok: false, reason: "guest" });
  });
});

describe("createDecision", () => {
  it("needs no account in an open league and creates an unowned wizard", () => {
    expect(
      createDecision({ policy: "anyone", sessionUserId: null, ownedPlayerId: null })
    ).toEqual({ ok: true, owned: false });
  });
  it("needs a sign-in elsewhere and gives the account one wizard", () => {
    for (const policy of ["members", "organizer"] as const) {
      expect(
        createDecision({ policy, sessionUserId: null, ownedPlayerId: null })
      ).toEqual({ ok: false, reason: "sign_in" });
      expect(
        createDecision({ policy, sessionUserId: "u1", ownedPlayerId: null })
      ).toEqual({ ok: true, owned: true });
      expect(
        createDecision({ policy, sessionUserId: "u1", ownedPlayerId: "p1" })
      ).toEqual({ ok: false, reason: "has_wizard" });
    }
  });
});

describe("ownerAllows", () => {
  it("lets any token holder act as an unowned wizard", () => {
    expect(ownerAllows(null, null)).toBe(true);
    expect(ownerAllows(null, "u1")).toBe(true);
  });
  it("needs the owner's session for an owned wizard", () => {
    expect(ownerAllows("u1", "u1")).toBe(true);
    expect(ownerAllows("u1", "u2")).toBe(false);
    expect(ownerAllows("u1", null)).toBe(false);
  });
});

describe("parseClaimPolicy", () => {
  it("falls back to the open policy for anything unknown", () => {
    expect(parseClaimPolicy("members")).toBe("members");
    expect(parseClaimPolicy("nonsense")).toBe("anyone");
    expect(parseClaimPolicy(null)).toBe("anyone");
  });
});
