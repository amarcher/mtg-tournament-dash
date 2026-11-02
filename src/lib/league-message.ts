/**
 * The organizer's one-off notification, the pure half: what counts as a
 * valid note, where a tap may land, and the presets the composer offers.
 * The server action resolves ids against the league and sends; this module
 * is shared with the composer so both sides agree on the limits.
 */

/** A notification title is a phone-width line; a body is two. */
export const MESSAGE_TITLE_MAX = 50;
export const MESSAGE_BODY_MAX = 160;
/** A second Send inside this window is a double tap, not a second note. */
export const MESSAGE_REPEAT_GUARD_MS = 30_000;

export type MessageDestination =
  | { kind: "home" }
  | { kind: "schedule" }
  | { kind: "standings" }
  | { kind: "event"; id: string }
  | { kind: "poll"; id: string }
  | { kind: "night"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The form value: "schedule", "event:<uuid>", ... */
export function parseDestination(raw: string): MessageDestination | null {
  const value = raw.trim();
  if (value === "home" || value === "schedule" || value === "standings") {
    return { kind: value };
  }
  const [kind, id] = value.split(":");
  if ((kind === "event" || kind === "poll" || kind === "night") && id && UUID.test(id)) {
    return { kind, id };
  }
  return null;
}

export function destinationKey(d: MessageDestination): string {
  return "id" in d ? `${d.kind}:${d.id}` : d.kind;
}

/** The site path a tap opens, relative to the origin. */
export function destinationPath(d: MessageDestination, leagueSlug: string): string {
  const base = `/leagues/${leagueSlug}`;
  switch (d.kind) {
    case "home":
      return base;
    case "schedule":
      return `${base}/schedule`;
    case "standings":
      return `${base}/standings`;
    case "event":
      // The phone-scale page: a finished event shows the player's own
      // placing there, where the broadcast route is the TV view.
      return `/events/${d.id}/play`;
    case "poll":
      return `${base}/schedule/${d.id}`;
    case "night":
      return `${base}/schedule/nights/${d.id}`;
  }
}

export type MessageText = { title: string; body: string };

/** Trims, collapses inner whitespace, and enforces the phone-width limits. */
export function validateMessage(input: {
  title: string;
  body: string;
}): { ok: true; value: MessageText } | { ok: false; error: string } {
  const title = input.title.replace(/\s+/g, " ").trim();
  const body = input.body.replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "Give the note a title" };
  if (title.length > MESSAGE_TITLE_MAX) {
    return { ok: false, error: `Keep the title under ${MESSAGE_TITLE_MAX} characters` };
  }
  if (!body) return { ok: false, error: "Write the note" };
  if (body.length > MESSAGE_BODY_MAX) {
    return { ok: false, error: `Keep the note under ${MESSAGE_BODY_MAX} characters` };
  }
  return { ok: true, value: { title, body } };
}

export interface MessagePreset {
  id: string;
  label: string;
  title: string;
  body: string;
  /** Which destination the composer selects when the preset is applied. */
  destination: "schedule" | "standings" | "latest_event" | "latest_poll" | "next_night";
}

export const MESSAGE_PRESETS: MessagePreset[] = [
  {
    id: "rsvp",
    label: "Please RSVP",
    title: "Please RSVP",
    body: "Let us know if you can make the next game night.",
    destination: "next_night",
  },
  {
    id: "vote",
    label: "Vote on dates",
    title: "Pick a date",
    body: "The date poll is still open — tap to vote.",
    destination: "latest_poll",
  },
  {
    id: "results",
    label: "Results are in",
    title: "Results are in",
    body: "Final standings are posted. See how you finished.",
    destination: "latest_event",
  },
];

/** Within the guard window of the last send: a double tap, refuse it. */
export function isRepeatSend(lastSentAt: Date | null, now: Date = new Date()): boolean {
  return lastSentAt !== null && now.getTime() - lastSentAt.getTime() < MESSAGE_REPEAT_GUARD_MS;
}
