import { describe, expect, it } from "vitest";
import {
  MESSAGE_BODY_MAX,
  MESSAGE_REPEAT_GUARD_MS,
  destinationKey,
  destinationPath,
  isRepeatSend,
  parseDestination,
  validateMessage,
} from "./league-message";

const id = "5f0a1b2c-3d4e-4f60-8a9b-0c1d2e3f4a5b";

describe("parseDestination", () => {
  it("accepts the fixed pages and typed ids", () => {
    expect(parseDestination("schedule")).toEqual({ kind: "schedule" });
    expect(parseDestination(`event:${id}`)).toEqual({ kind: "event", id });
    expect(parseDestination(` night:${id} `)).toEqual({ kind: "night", id });
  });

  it("refuses anything that is not a known page or a uuid", () => {
    expect(parseDestination("https://evil.test")).toBeNull();
    expect(parseDestination("event:../../admin")).toBeNull();
    expect(parseDestination("")).toBeNull();
  });

  it("round-trips through destinationKey", () => {
    for (const raw of ["home", "standings", `poll:${id}`]) {
      expect(destinationKey(parseDestination(raw)!)).toBe(raw);
    }
  });
});

describe("destinationPath", () => {
  it("builds league-relative paths", () => {
    expect(destinationPath({ kind: "home" }, "tuesday")).toBe("/leagues/tuesday");
    expect(destinationPath({ kind: "poll", id }, "tuesday")).toBe(
      `/leagues/tuesday/schedule/${id}`
    );
    expect(destinationPath({ kind: "event", id }, "tuesday")).toBe(`/events/${id}/play`);
  });
});

describe("validateMessage", () => {
  it("trims and collapses whitespace", () => {
    const r = validateMessage({ title: "  Results   are in ", body: "See\n\nhow you did " });
    expect(r).toEqual({ ok: true, value: { title: "Results are in", body: "See how you did" } });
  });

  it("requires both lines and caps their length", () => {
    expect(validateMessage({ title: "", body: "x" }).ok).toBe(false);
    expect(validateMessage({ title: "t", body: "" }).ok).toBe(false);
    expect(
      validateMessage({ title: "t", body: "x".repeat(MESSAGE_BODY_MAX + 1) }).ok
    ).toBe(false);
    expect(validateMessage({ title: "t", body: "x".repeat(MESSAGE_BODY_MAX) }).ok).toBe(true);
  });
});

describe("isRepeatSend", () => {
  const now = new Date("2026-11-01T20:00:00Z");
  it("treats a send inside the guard window as a double tap", () => {
    expect(isRepeatSend(null, now)).toBe(false);
    expect(isRepeatSend(new Date(now.getTime() - 1000), now)).toBe(true);
    expect(isRepeatSend(new Date(now.getTime() - MESSAGE_REPEAT_GUARD_MS), now)).toBe(false);
  });
});
