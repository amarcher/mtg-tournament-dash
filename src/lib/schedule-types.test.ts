import { describe, it, expect } from "vitest";
import {
  formatPollDate,
  formatPollDateParts,
  parseDateTimeLocal,
  toDateTimeLocal,
} from "./schedule-types";

describe("parseDateTimeLocal", () => {
  it("interprets winter wall time as EST (UTC-5)", () => {
    expect(parseDateTimeLocal("2026-01-16T19:00")?.toISOString()).toBe(
      "2026-01-17T00:00:00.000Z"
    );
  });

  it("interprets summer wall time as EDT (UTC-4)", () => {
    expect(parseDateTimeLocal("2026-07-17T19:00")?.toISOString()).toBe(
      "2026-07-17T23:00:00.000Z"
    );
  });

  it("rejects malformed input", () => {
    expect(parseDateTimeLocal("")).toBeNull();
    expect(parseDateTimeLocal("next friday")).toBeNull();
  });
});

describe("formatPollDate", () => {
  it("round-trips to the wall time the creator typed", () => {
    const parsed = parseDateTimeLocal("2026-07-17T19:00")!;
    expect(formatPollDate(parsed)).toBe("Fri, Jul 17, 7:00 PM");
  });
});

describe("toDateTimeLocal", () => {
  it("round-trips a wall time through parseDateTimeLocal", () => {
    for (const wall of [
      "2026-08-31T19:00",
      "2026-01-05T09:30",
      "2026-11-09T19:00", // after the fall-back
      "2026-03-09T19:00", // after the spring-forward
    ]) {
      expect(toDateTimeLocal(parseDateTimeLocal(wall)!)).toBe(wall);
    }
  });
});

describe("formatPollDateParts", () => {
  it("splits a wall time into calendar-tile pieces", () => {
    const d = parseDateTimeLocal("2026-08-31T19:00")!;
    expect(formatPollDateParts(d)).toEqual({
      weekday: "Mon",
      month: "Aug",
      day: "31",
      time: "7:00 PM",
    });
  });

  it("agrees with formatPollDate across the DST boundary", () => {
    for (const wall of ["2026-10-26T19:00", "2026-11-09T19:00"]) {
      const d = parseDateTimeLocal(wall)!;
      const { time } = formatPollDateParts(d);
      expect(formatPollDate(d)).toContain(time);
      expect(time).toBe("7:00 PM");
    }
  });
});
