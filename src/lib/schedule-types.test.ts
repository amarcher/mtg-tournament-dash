import { describe, it, expect } from "vitest";
import { formatPollDate, parseDateTimeLocal } from "./schedule-types";

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
