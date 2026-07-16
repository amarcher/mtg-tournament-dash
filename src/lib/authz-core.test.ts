import { describe, expect, it } from "vitest";
import {
  evaluateOrganizerAccess,
  type OrganizerAccessInput,
} from "./authz-core";

function input(overrides: Partial<OrganizerAccessInput>): OrganizerAccessInput {
  return {
    hasRequestScope: true,
    sessionUserId: null,
    ownerUserId: null,
    membershipRole: null,
    cookieOrganizerToken: null,
    leagueOrganizerToken: null,
    ...overrides,
  };
}

describe("evaluateOrganizerAccess", () => {
  it("allows outside a request scope (trusted script path)", () => {
    expect(evaluateOrganizerAccess(input({ hasRequestScope: false }))).toBe(
      true
    );
  });

  it("denies when nothing identifies the caller", () => {
    expect(evaluateOrganizerAccess(input({}))).toBe(false);
  });

  it("allows the league owner by session", () => {
    expect(
      evaluateOrganizerAccess(
        input({ sessionUserId: "u1", ownerUserId: "u1" })
      )
    ).toBe(true);
  });

  it("denies a signed-in non-member who isn't the owner", () => {
    expect(
      evaluateOrganizerAccess(
        input({ sessionUserId: "u2", ownerUserId: "u1" })
      )
    ).toBe(false);
  });

  it("allows a member with either role", () => {
    for (const role of ["owner", "organizer"] as const) {
      expect(
        evaluateOrganizerAccess(
          input({ sessionUserId: "u2", membershipRole: role })
        )
      ).toBe(true);
    }
  });

  it("allows a matching organizer-token cookie without any session", () => {
    expect(
      evaluateOrganizerAccess(
        input({ cookieOrganizerToken: "tok", leagueOrganizerToken: "tok" })
      )
    ).toBe(true);
  });

  it("denies a mismatched organizer-token cookie", () => {
    expect(
      evaluateOrganizerAccess(
        input({ cookieOrganizerToken: "stale", leagueOrganizerToken: "tok" })
      )
    ).toBe(false);
  });

  it("never matches when the league has no token minted", () => {
    expect(
      evaluateOrganizerAccess(
        input({ cookieOrganizerToken: null, leagueOrganizerToken: null })
      )
    ).toBe(false);
    expect(
      evaluateOrganizerAccess(
        input({ cookieOrganizerToken: "anything", leagueOrganizerToken: null })
      )
    ).toBe(false);
  });

  it("cookie match still allows when a session exists but has no role", () => {
    expect(
      evaluateOrganizerAccess(
        input({
          sessionUserId: "u3",
          cookieOrganizerToken: "tok",
          leagueOrganizerToken: "tok",
        })
      )
    ).toBe(true);
  });
});
