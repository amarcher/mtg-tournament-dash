import { describe, expect, it } from "vitest";
import { shouldAutoEnroll } from "./push-enroll";

describe("shouldAutoEnroll", () => {
  it("asks a fresh phone once", () => {
    expect(shouldAutoEnroll({ permission: "prompt", askedAt: null })).toBe(true);
    expect(shouldAutoEnroll({ permission: "prompt", askedAt: 1 })).toBe(false);
  });

  it("re-registers a phone that already allowed notifications, never a denied one", () => {
    expect(shouldAutoEnroll({ permission: "granted", askedAt: 1 })).toBe(true);
    expect(shouldAutoEnroll({ permission: "denied", askedAt: null })).toBe(false);
  });
});
