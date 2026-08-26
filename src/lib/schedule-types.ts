// Shared between server actions and client/server components — keep free of
// "use server" so constants can be imported from both sides (same split as
// wizard-types.ts).

// The league is a single friend group in one place; all poll dates are wall
// times in this zone no matter where the server runs (Vercel is UTC).
export const LEAGUE_TIMEZONE = "America/New_York";

export const POLL_RESPONSES = ["yes", "if_need_be", "no"] as const;
export type PollResponseValue = (typeof POLL_RESPONSES)[number];

export const POLL_RESPONSE_LABELS: Record<PollResponseValue, string> = {
  yes: "✅ Yes",
  if_need_be: "🟡 If need be",
  no: "❌ No",
};

export function isPollResponse(value: unknown): value is PollResponseValue {
  return POLL_RESPONSES.includes(value as PollResponseValue);
}

const wallTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LEAGUE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function tzOffsetMs(ts: number): number {
  const parts = wallTimeFormatter.formatToParts(new Date(ts));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  // Some ICU versions render midnight as "24" with hour12: false.
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );
  return asUtc - ts;
}

/**
 * Interpret a `datetime-local` input value ("2026-07-18T19:00") as wall time
 * in LEAGUE_TIMEZONE and return the corresponding UTC instant. The double
 * offset lookup settles values that land on a DST transition.
 */
export function parseDateTimeLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  const once = utcGuess - tzOffsetMs(utcGuess);
  return new Date(utcGuess - tzOffsetMs(once));
}

const dateTimeLocalFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LEAGUE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Inverse of parseDateTimeLocal: render a stored instant as the wall time a
 * `datetime-local` input expects, so an edit form round-trips a date without
 * shifting it by the server's UTC offset.
 */
export function toDateTimeLocal(value: Date | string | number): string {
  const parts = dateTimeLocalFormatter.formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

const pollDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LEAGUE_TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LEAGUE_TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The same wall-time rendering as formatPollDate, broken into pieces so a
 * layout can compose them — the OG card stacks month over day as a calendar
 * tile rather than printing one string.
 */
export function formatPollDateParts(value: Date | string | number) {
  const parts = partsFormatter.formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    month: get("month"),
    day: get("day"),
    time: `${get("hour")}:${get("minute")} ${get("dayPeriod")}`.trim(),
  };
}

export function formatPollDate(value: Date | string | number) {
  return pollDateFormatter.format(new Date(value));
}
