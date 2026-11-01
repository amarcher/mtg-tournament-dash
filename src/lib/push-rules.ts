import { formatPollDate } from "./schedule-types";

/**
 * The pure half of push notifications: what each kind says, where a tap
 * lands, how a notification maps onto an APNs request and an FCM message,
 * and how a store's refusal is read. No I/O, so it is unit-tested; the
 * sender in push.ts does the network work.
 */

export type PushPlatform = "ios" | "android";

export type PushKind = "round_started" | "date_poll" | "game_nights" | "test";

/** The per-device switch a kind is gated by. */
export type PushPref = "notifyRounds" | "notifySchedule";

export function prefForKind(kind: PushKind): PushPref | null {
  switch (kind) {
    case "round_started":
      return "notifyRounds";
    case "date_poll":
    case "game_nights":
      return "notifySchedule";
    case "test":
      return null;
  }
}

export interface PushNotification {
  kind: PushKind;
  title: string;
  body: string;
  /** Absolute https link on the site; a tap opens it in the shell. */
  url: string;
  /** Replaces an earlier notification with the same id instead of stacking. */
  collapseId: string;
  /** How long a store may hold it for an offline phone, in seconds. */
  ttlSeconds: number;
}

export const DEFAULT_SITE = "https://mtg.capxun.com";
export const APNS_BUNDLE_ID = "com.capxun.mtgdash";
/** The Android channel the shell creates and FCM messages name. */
export const PUSH_CHANNEL_ID = "mtg-dash";

/** A round that started an hour ago is over or nearly so. */
export const ROUND_TTL_SECONDS = 60 * 60;
/** A poll stays open for days; a day-old nudge is still useful. */
export const SCHEDULE_TTL_SECONDS = 24 * 60 * 60;

export interface RoundSeat {
  roundNumber: number;
  eventId: string;
  eventName: string;
  tableNumber: number;
  /** Null for a bye. */
  opponentName: string | null;
}

export function roundNotification(
  seat: RoundSeat,
  site: string = DEFAULT_SITE
): PushNotification {
  const body =
    seat.opponentName === null
      ? `You have the bye this round · ${seat.eventName}`
      : `Table ${seat.tableNumber} vs ${seat.opponentName} · ${seat.eventName}`;
  return {
    kind: "round_started",
    title: `Round ${seat.roundNumber} is starting`,
    body,
    url: `${site}/events/${seat.eventId}/play`,
    collapseId: `round-${seat.eventId}-${seat.roundNumber}`,
    ttlSeconds: ROUND_TTL_SECONDS,
  };
}

export function pollNotification(
  input: {
    creatorName: string;
    title: string;
    optionCount: number;
    leagueSlug: string;
    pollId: string;
  },
  site: string = DEFAULT_SITE
): PushNotification {
  const nights = input.optionCount === 1 ? "1 night" : `${input.optionCount} nights`;
  return {
    kind: "date_poll",
    title: `${input.creatorName} posted a date poll`,
    body: `${input.title} · ${nights} to choose from · tap to answer`,
    url: `${site}/leagues/${input.leagueSlug}/schedule/${input.pollId}`,
    collapseId: `poll-${input.pollId}`,
    ttlSeconds: SCHEDULE_TTL_SECONDS,
  };
}

export function gameNightsNotification(
  input: { dates: Date[]; leagueSlug: string; leagueName: string },
  site: string = DEFAULT_SITE
): PushNotification | null {
  const sorted = [...input.dates].sort((a, b) => a.getTime() - b.getTime());
  if (sorted.length === 0) return null;
  const first = formatPollDate(sorted[0]);
  const rest = sorted.length - 1;
  const body =
    rest === 0
      ? `${first} · RSVP`
      : `${first} and ${rest} more ${rest === 1 ? "date" : "dates"} · RSVP`;
  return {
    kind: "game_nights",
    title:
      sorted.length === 1
        ? `New game night in ${input.leagueName}`
        : `New game nights in ${input.leagueName}`,
    body,
    url: `${site}/leagues/${input.leagueSlug}/schedule`,
    // Collapse per batch, not per league: two batches on one day are two
    // separate pieces of news.
    collapseId: `nights-${input.leagueSlug}-${sorted[0].getTime()}`,
    ttlSeconds: SCHEDULE_TTL_SECONDS,
  };
}

export function testNotification(site: string = DEFAULT_SITE): PushNotification {
  return {
    kind: "test",
    title: "MTG Dash",
    body: "Notifications are set up on this phone.",
    url: `${site}/`,
    collapseId: "test",
    ttlSeconds: 10 * 60,
  };
}

/** The APNs request for one device token: headers and JSON body. */
export function apnsRequest(
  note: PushNotification,
  bundleId: string = APNS_BUNDLE_ID,
  now: Date = new Date()
): { headers: Record<string, string>; body: unknown } {
  return {
    headers: {
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": note.collapseId.slice(0, 64),
      "apns-expiration": String(
        Math.floor(now.getTime() / 1000) + note.ttlSeconds
      ),
    },
    body: {
      aps: { alert: { title: note.title, body: note.body }, sound: "default" },
      url: note.url,
      kind: note.kind,
    },
  };
}

/** The FCM HTTP v1 message for one device token. */
export function fcmMessage(note: PushNotification, token: string): unknown {
  return {
    message: {
      token,
      notification: { title: note.title, body: note.body },
      data: { url: note.url, kind: note.kind },
      android: {
        collapse_key: note.collapseId.slice(0, 64),
        ttl: `${note.ttlSeconds}s`,
        priority: "high",
        notification: { channel_id: PUSH_CHANNEL_ID },
      },
    },
  };
}

/**
 * Whether a store's answer means the token is gone for good (uninstalled,
 * or minted for another app) rather than a passing failure.
 */
export function tokenUnregistered(
  platform: PushPlatform,
  status: number,
  reason: string | null | undefined
): boolean {
  if (platform === "ios") {
    return (
      status === 410 ||
      reason === "BadDeviceToken" ||
      reason === "Unregistered" ||
      reason === "DeviceTokenNotForTopic"
    );
  }
  return (
    status === 404 ||
    reason === "UNREGISTERED" ||
    reason === "NOT_FOUND" ||
    reason === "INVALID_ARGUMENT"
  );
}

/**
 * Apple accepts a provider token for an hour and asks that it not be
 * refreshed more often than every 20 minutes; 50 minutes sits inside both.
 */
export const APNS_TOKEN_REFRESH_MS = 50 * 60 * 1000;

export function apnsTokenStale(issuedAtMs: number, now: Date = new Date()) {
  return now.getTime() - issuedAtMs > APNS_TOKEN_REFRESH_MS;
}

/** Device tokens are hex (APNs) or a long opaque string (FCM); reject junk early. */
export function isPlausibleToken(token: string): boolean {
  return token.length >= 16 && token.length <= 4096 && !/\s/.test(token);
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

/**
 * FCM_SERVICE_ACCOUNT is the service-account JSON, as-is or base64-encoded.
 * The runbook stores base64: the JSON's private key is full of `\n` escapes
 * and inner quotes, which `vercel env pull` plus dotenv unpick into text
 * JSON.parse rejects, while base64 survives every tool in the chain.
 */
export function parseServiceAccount(
  raw: string | undefined
): ServiceAccount | null {
  if (!raw) return null;
  for (const text of [raw, decodeBase64(raw)]) {
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as Partial<ServiceAccount>;
      if (parsed.client_email && parsed.private_key && parsed.project_id) {
        return parsed as ServiceAccount;
      }
    } catch {
      /* not this form */
    }
  }
  return null;
}

function decodeBase64(raw: string): string | null {
  const compact = raw.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+=*$/.test(compact)) return null;
  try {
    return atob(compact);
  } catch {
    return null;
  }
}
