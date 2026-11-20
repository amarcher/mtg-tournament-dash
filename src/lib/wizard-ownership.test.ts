import { describe, expect, it } from "vitest";
import {
  claimCard,
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
  isOrganizer: false,
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

describe("claimDecision for an organizer", () => {
  const organizer = { ...base, isOrganizer: true } as const;
  it("runs a guest without taking it when guests are organizer-run", () => {
    for (const sessionUserId of [null, "u1"]) {
      for (const ownedPlayerId of [null, "p2"]) {
        expect(
          claimDecision({
            ...organizer,
            policy: "organizer",
            sessionUserId,
            ownedPlayerId,
          })
        ).toEqual({ ok: true, takeOwnership: false });
      }
    }
  });
  it("runs a second wizard under members instead of being refused", () => {
    expect(
      claimDecision({
        ...organizer,
        policy: "members",
        sessionUserId: "u1",
        ownedPlayerId: "p2",
      })
    ).toEqual({ ok: true, takeOwnership: false });
    expect(claimDecision({ ...organizer, policy: "members" })).toEqual({
      ok: true,
      takeOwnership: false,
    });
  });
  it("still picks their own wizard like any member", () => {
    expect(
      claimDecision({ ...organizer, policy: "members", sessionUserId: "u1" })
    ).toEqual({ ok: true, takeOwnership: true });
  });
  it("gets no way into a wizard another account owns", () => {
    for (const policy of ["anyone", "members", "organizer"] as const) {
      expect(
        claimDecision({
          ...organizer,
          policy,
          ownerUserId: "u2",
          sessionUserId: "u1",
        })
      ).toEqual({ ok: false, reason: "taken" });
    }
  });
});

describe("claimCard", () => {
  it("labels what a tap will meet and locks the dead ends", () => {
    expect(claimCard({ ok: true, takeOwnership: true })).toEqual({
      label: null,
      locked: false,
    });
    expect(claimCard({ ok: false, reason: "sign_in" })).toEqual({
      label: "Sign in",
      locked: false,
    });
    expect(claimCard({ ok: false, reason: "taken" })).toEqual({
      label: "Taken",
      locked: true,
    });
    expect(claimCard({ ok: false, reason: "guest" })).toEqual({
      label: "Guest",
      locked: true,
    });
    expect(claimCard({ ok: false, reason: "has_wizard" })).toEqual({
      label: null,
      locked: true,
    });
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
