import { describe, expect, it } from "vitest";
import {
  addDaysToDateTimeLocal,
  generateDateSeries,
  MAX_SERIES_COUNT,
} from "./recurrence";
import { parseDateTimeLocal } from "./schedule-types";

describe("addDaysToDateTimeLocal", () => {
  it("rolls over month and year boundaries", () => {
    expect(addDaysToDateTimeLocal("2026-08-31T19:00", 14)).toBe(
      "2026-09-14T19:00"
    );
    expect(addDaysToDateTimeLocal("2026-12-28T19:00", 7)).toBe(
      "2027-01-04T19:00"
    );
  });

  it("leaves an unparseable value alone", () => {
    expect(addDaysToDateTimeLocal("nonsense", 7)).toBe("nonsense");
  });
});

describe("generateDateSeries", () => {
  it("walks every other Monday from a Monday start", () => {
    const dates = generateDateSeries({
      start: "2026-08-31T19:00",
      intervalWeeks: 2,
      count: 4,
    });
    expect(dates).toEqual([
      "2026-08-31T19:00",
      "2026-09-14T19:00",
      "2026-09-28T19:00",
      "2026-10-12T19:00",
    ]);
    // Every date is the same weekday as the start.
    for (const d of dates) {
      expect(new Date(`${d}:00Z`).getUTCDay()).toBe(1);
    }
  });

  it("keeps the clock time across the DST boundary", () => {
    // Nov 1 2026 is the fall-back in America/New_York; the wall time must
    // stay 19:00 even though the UTC instant shifts by an hour.
    const [before, after] = generateDateSeries({
      start: "2026-10-26T19:00",
      intervalWeeks: 2,
      count: 2,
    });
    expect(after).toBe("2026-11-09T19:00");
    const beforeUtc = parseDateTimeLocal(before)!;
    const afterUtc = parseDateTimeLocal(after)!;
    expect(afterUtc.getTime() - beforeUtc.getTime()).toBe(
      14 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000
    );
  });

  it("caps the run and rejects nonsense input", () => {
    expect(
      generateDateSeries({
        start: "2026-08-31T19:00",
        intervalWeeks: 2,
        count: 100,
      })
    ).toHaveLength(MAX_SERIES_COUNT);
    expect(
      generateDateSeries({ start: "", intervalWeeks: 2, count: 4 })
    ).toEqual([]);
    expect(
      generateDateSeries({
        start: "2026-08-31T19:00",
        intervalWeeks: 0,
        count: 4,
      })
    ).toEqual([]);
  });
});
