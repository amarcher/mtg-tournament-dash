// Pure wall-time date-series math, shared by the "open a run of dates" form
// (client) and the server action that persists them. No DB or server-only
// imports — the client preview and the server insert must agree exactly.

export const RECURRENCE_INTERVALS = [
  { weeks: 1, label: "Every week" },
  { weeks: 2, label: "Every other week" },
  { weeks: 3, label: "Every 3 weeks" },
  { weeks: 4, label: "Every 4 weeks" },
] as const;

export const MAX_SERIES_COUNT = 26;

const DATETIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Advance a `datetime-local` value by whole days on the *calendar*, keeping
 * the clock time untouched. Doing the arithmetic on wall time (rather than on
 * a UTC instant) is what makes a 7pm series stay at 7pm across a DST change —
 * each string is converted to an instant separately by parseDateTimeLocal.
 */
export function addDaysToDateTimeLocal(value: string, days: number): string {
  const m = DATETIME_LOCAL.exec(value);
  if (!m) return value;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const shifted = new Date(Date.UTC(y, mo - 1, d + days));
  return (
    `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-` +
    `${pad2(shifted.getUTCDate())}T${pad2(h)}:${pad2(mi)}`
  );
}

export function isDateTimeLocal(value: string): boolean {
  return DATETIME_LOCAL.test(value);
}

/**
 * The recurrence the league runs on: N dates, `intervalWeeks` apart, from a
 * starting wall time. The start date carries the weekday — "every other
 * Monday from Aug 31" is just Aug 31 + 14-day steps.
 */
export function generateDateSeries({
  start,
  intervalWeeks,
  count,
}: {
  start: string;
  intervalWeeks: number;
  count: number;
}): string[] {
  if (!isDateTimeLocal(start)) return [];
  const step = Math.trunc(intervalWeeks);
  const total = Math.min(Math.trunc(count), MAX_SERIES_COUNT);
  if (step < 1 || total < 1) return [];
  return Array.from({ length: total }, (_, i) =>
    addDaysToDateTimeLocal(start, i * step * 7)
  );
}
