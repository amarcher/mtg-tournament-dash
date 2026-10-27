import { describe, expect, it } from "vitest";
import { resumeDecision, STALE_AFTER_MS } from "./resume";

describe("resumeDecision", () => {
  it("does nothing after a brief app switch", () => {
    expect(
      resumeDecision({ awayMs: STALE_AFTER_MS - 1, localId: "a", remoteId: "b" })
    ).toBe("none");
  });
  it("refreshes the route once the page has been away long enough", () => {
    expect(
      resumeDecision({ awayMs: STALE_AFTER_MS, localId: "a", remoteId: "a" })
    ).toBe("refresh");
  });
  it("reloads when the server runs a newer deployment", () => {
    expect(
      resumeDecision({ awayMs: STALE_AFTER_MS, localId: "a", remoteId: "b" })
    ).toBe("reload");
  });
  it("falls back to a refresh when either deployment id is unknown", () => {
    expect(
      resumeDecision({ awayMs: Infinity, localId: null, remoteId: "b" })
    ).toBe("refresh");
    expect(
      resumeDecision({ awayMs: Infinity, localId: "a", remoteId: null })
    ).toBe("refresh");
  });
});
