import http2 from "node:http2";
import { after } from "next/server";
import { importPKCS8, SignJWT } from "jose";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { players, pushDevices, pushLog } from "@/db/schema";
import type { Event, Match } from "@/db/schema";
import {
  listDevicesForPlayers,
  listLeaguePlayerIds,
  type RecipientDevice,
} from "@/lib/push-devices";
import {
  APNS_BUNDLE_ID,
  DEFAULT_SITE,
  apnsRequest,
  apnsTokenStale,
  fcmMessage,
  gameNightsNotification,
  leagueMessageNotification,
  parseServiceAccount,
  pollNotification,
  prefForKind,
  roundNotification,
  testNotification,
  type ServiceAccount,
  tokenUnregistered,
  type PushNotification,
  type PushPlatform,
} from "@/lib/push-rules";

/**
 * The one sender of push notifications. iOS goes straight to APNs over
 * HTTP/2 (Node's fetch speaks HTTP/1.1 only, so this uses node:http2) with
 * an ES256 provider token signed from the team's .p8; Android goes to FCM
 * HTTP v1 with an OAuth2 token minted from the Firebase service account.
 * A store's "this token is gone" answer deletes the device row; every other
 * outcome becomes a push_log row.
 *
 * Env: APNS_KEY_ID, APNS_TEAM_ID, APNS_P8 (the key's PEM text, newlines
 * intact or as \n), APNS_BUNDLE_ID (default com.capxun.mtgdash),
 * APNS_SANDBOX=1 for an Xcode-run development build, FCM_SERVICE_ACCOUNT
 * (the service-account JSON, whole), PUBLIC_URL for the links a tap opens.
 * With nothing set, sends fail with a `*_not_configured` reason and the app
 * otherwise behaves as before — docs/push-setup.md is the runbook.
 */

type Outcome = "sent" | "unregistered" | "failed" | "opted_out";
type Counts = Record<Outcome, number>;

const emptyCounts = (): Counts => ({
  sent: 0,
  unregistered: 0,
  failed: 0,
  opted_out: 0,
});

function site(): string {
  return (process.env.PUBLIC_URL ?? DEFAULT_SITE).replace(/\/+$/, "");
}

export function pushConfigured() {
  return {
    apns: Boolean(
      process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_P8
    ),
    fcm: serviceAccount() !== null,
  };
}

/**
 * Sending is never on the request's critical path: `after()` runs the work
 * once the response is out. Outside a request scope (the verify harness
 * under tsx) `after()` throws, and there the work is awaited so the script
 * can assert on push_log.
 */
export async function runAfterResponse(work: () => Promise<unknown>) {
  const guarded = async () => {
    try {
      await work();
    } catch (err) {
      console.error("push:", err);
    }
  };
  try {
    after(guarded);
  } catch {
    await guarded();
  }
}

// --- APNs ------------------------------------------------------------------

let apnsJwt: { value: string; issuedAt: number } | null = null;

async function apnsProviderToken(): Promise<string> {
  if (apnsJwt && !apnsTokenStale(apnsJwt.issuedAt)) return apnsJwt.value;
  const pem = (process.env.APNS_P8 ?? "").replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "ES256");
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APNS_KEY_ID! })
    .setIssuer(process.env.APNS_TEAM_ID!)
    .setIssuedAt()
    .sign(key);
  apnsJwt = { value, issuedAt: Date.now() };
  return value;
}

let apnsSession: http2.ClientHttp2Session | null = null;

function apnsHost(): string {
  return process.env.APNS_SANDBOX === "1"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
}

// One HTTP/2 session per function instance, reconnected after any error or
// GOAWAY. Apple throttles connection churn, so a fresh session per send
// would be the wrong shape.
function getApnsSession(): http2.ClientHttp2Session {
  if (apnsSession && !apnsSession.closed && !apnsSession.destroyed)
    return apnsSession;
  const session = http2.connect(apnsHost());
  const forget = () => {
    if (apnsSession === session) apnsSession = null;
  };
  session.on("error", forget);
  session.on("close", forget);
  session.on("goaway", forget);
  apnsSession = session;
  return session;
}

function apnsPost(
  token: string,
  headers: Record<string, string>,
  body: unknown
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const session = getApnsSession();
    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${encodeURIComponent(token)}`,
      "content-type": "application/json",
      ...headers,
    });
    const timer = setTimeout(() => {
      req.close(http2.constants.NGHTTP2_CANCEL);
      reject(new Error("apns_timeout"));
    }, 10_000);
    let status = 0;
    let text = "";
    req.setEncoding("utf8");
    req.on("response", (h) => {
      status = Number(h[":status"] ?? 0);
    });
    req.on("data", (chunk: string) => {
      text += chunk;
    });
    req.on("end", () => {
      clearTimeout(timer);
      resolve({ status, text });
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end(JSON.stringify(body));
  });
}

async function sendApns(
  token: string,
  note: PushNotification
): Promise<{ outcome: Outcome; reason?: string }> {
  if (!pushConfigured().apns)
    return { outcome: "failed", reason: "apns_not_configured" };
  const req = apnsRequest(
    note,
    process.env.APNS_BUNDLE_ID ?? APNS_BUNDLE_ID
  );
  let res: { status: number; text: string };
  try {
    res = await apnsPost(
      token,
      { ...req.headers, authorization: `bearer ${await apnsProviderToken()}` },
      req.body
    );
  } catch (err) {
    apnsSession = null;
    return { outcome: "failed", reason: String(err) };
  }
  if (res.status === 200) return { outcome: "sent" };
  let reason: string | undefined;
  try {
    reason = (JSON.parse(res.text) as { reason?: string }).reason;
  } catch {
    reason = undefined;
  }
  if (reason === "ExpiredProviderToken") apnsJwt = null;
  return {
    outcome: tokenUnregistered("ios", res.status, reason)
      ? "unregistered"
      : "failed",
    reason: reason ?? `http_${res.status}`,
  };
}

// --- FCM -------------------------------------------------------------------

const serviceAccount = () =>
  parseServiceAccount(process.env.FCM_SERVICE_ACCOUNT);

let fcmAccess: { token: string; expiresAt: number } | null = null;

async function fcmAccessToken(account: ServiceAccount): Promise<string> {
  if (fcmAccess && fcmAccess.expiresAt > Date.now() + 60_000)
    return fcmAccess.token;
  const key = await importPKCS8(account.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`fcm_oauth_${res.status}`);
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  fcmAccess = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

async function sendFcm(
  token: string,
  note: PushNotification
): Promise<{ outcome: Outcome; reason?: string }> {
  const account = serviceAccount();
  if (!account) return { outcome: "failed", reason: "fcm_not_configured" };
  let access: string;
  try {
    access = await fcmAccessToken(account);
  } catch (err) {
    return { outcome: "failed", reason: String(err) };
  }
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${access}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(fcmMessage(note, token)),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (res.ok) return { outcome: "sent" };
  let reason: string | undefined;
  try {
    const body = (await res.json()) as {
      error?: { status?: string; details?: { errorCode?: string }[] };
    };
    reason =
      body.error?.details?.find((d) => d.errorCode)?.errorCode ??
      body.error?.status;
  } catch {
    reason = undefined;
  }
  return {
    outcome: tokenUnregistered("android", res.status, reason)
      ? "unregistered"
      : "failed",
    reason: reason ?? `http_${res.status}`,
  };
}

// --- Delivery --------------------------------------------------------------

async function deliver(
  device: Pick<RecipientDevice, "deviceId" | "token" | "platform"> & {
    playerId: string | null;
  },
  note: PushNotification
): Promise<Outcome> {
  const result =
    device.platform === "ios"
      ? await sendApns(device.token, note)
      : await sendFcm(device.token, note);
  if (result.outcome === "unregistered") {
    await db.delete(pushDevices).where(eq(pushDevices.id, device.deviceId));
  } else if (result.outcome === "failed") {
    console.warn("push:", device.platform, note.kind, result.reason);
  }
  await db.insert(pushLog).values({
    deviceId: result.outcome === "unregistered" ? null : device.deviceId,
    playerId: device.playerId,
    kind: note.kind,
    collapseId: note.collapseId,
    outcome: result.outcome,
    reason: result.reason ?? null,
  });
  return result.outcome;
}

/**
 * Send each player their notification on every phone linked to them,
 * honoring the phone's switch for the kind. A phone linked to two of the
 * recipients (one person, two wizards) hears once.
 */
export async function notifyPlayers(
  recipients: Map<string, PushNotification>
): Promise<Counts> {
  const counts = emptyCounts();
  const devices = await listDevicesForPlayers([...recipients.keys()]);
  const seen = new Set<string>();
  for (const device of devices) {
    if (seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    const note = recipients.get(device.playerId);
    if (!note) continue;
    const pref = prefForKind(note.kind);
    if (pref && !device[pref]) {
      await db.insert(pushLog).values({
        deviceId: device.deviceId,
        playerId: device.playerId,
        kind: note.kind,
        collapseId: note.collapseId,
        outcome: "opted_out",
      });
      counts.opted_out += 1;
      continue;
    }
    counts[await deliver(device, note)] += 1;
  }
  return counts;
}

/** The runbook's smoke test: one phone, no switches consulted. */
export async function sendTestNotification(token: string) {
  const [device] = await db
    .select()
    .from(pushDevices)
    .where(eq(pushDevices.token, token));
  if (!device) return { outcome: "no_device" as const };
  const outcome = await deliver(
    {
      deviceId: device.id,
      token: device.token,
      platform: device.platform as PushPlatform,
      playerId: null,
    },
    testNotification(site())
  );
  return { outcome };
}

// --- The three triggers ----------------------------------------------------

/** Round confirmed: everyone seated hears their table and opponent; byes hear that. */
export async function notifyRoundStarted(
  event: Pick<Event, "id" | "name">,
  roundNumber: number,
  roundMatches: Pick<Match, "tableNumber" | "playerAId" | "playerBId">[]
) {
  const ids = [
    ...new Set(
      roundMatches.flatMap((m) =>
        m.playerBId ? [m.playerAId, m.playerBId] : [m.playerAId]
      )
    ),
  ];
  if (ids.length === 0) return emptyCounts();
  const named = await db
    .select({ id: players.id, displayName: players.displayName })
    .from(players)
    .where(inArray(players.id, ids));
  const names = new Map(named.map((p) => [p.id, p.displayName]));
  const base = site();
  const recipients = new Map<string, PushNotification>();
  for (const m of roundMatches) {
    const common = {
      roundNumber,
      eventId: event.id,
      eventName: event.name,
      tableNumber: m.tableNumber,
    };
    if (!m.playerBId) {
      recipients.set(
        m.playerAId,
        roundNotification({ ...common, opponentName: null }, base)
      );
      continue;
    }
    recipients.set(
      m.playerAId,
      roundNotification(
        { ...common, opponentName: names.get(m.playerBId) ?? "your opponent" },
        base
      )
    );
    recipients.set(
      m.playerBId,
      roundNotification(
        { ...common, opponentName: names.get(m.playerAId) ?? "your opponent" },
        base
      )
    );
  }
  return notifyPlayers(recipients);
}

/** A new date poll: the whole league except its author. */
export async function notifyDatePoll(input: {
  leagueId: string;
  leagueSlug: string;
  pollId: string;
  title: string;
  optionCount: number;
  creatorId: string;
  creatorName: string;
}) {
  const ids = await listLeaguePlayerIds(input.leagueId, input.creatorId);
  const note = pollNotification(
    {
      creatorName: input.creatorName,
      title: input.title,
      optionCount: input.optionCount,
      leagueSlug: input.leagueSlug,
      pollId: input.pollId,
    },
    site()
  );
  return notifyPlayers(new Map(ids.map((id) => [id, note])));
}

/** New dates on the calendar: the whole league. */
export async function notifyGameNights(input: {
  leagueId: string;
  leagueSlug: string;
  leagueName: string;
  dates: Date[];
}) {
  const note = gameNightsNotification(
    { dates: input.dates, leagueSlug: input.leagueSlug, leagueName: input.leagueName },
    site()
  );
  if (!note) return emptyCounts();
  const ids = await listLeaguePlayerIds(input.leagueId);
  return notifyPlayers(new Map(ids.map((id) => [id, note])));
}

/**
 * An organizer's one-off note to the whole league. Unlike the three
 * triggers above this is awaited by its action rather than run after the
 * response: the organizer is looking at a Send button and wants the count.
 */
export async function notifyLeagueMessage(input: {
  leagueId: string;
  messageId: string;
  title: string;
  body: string;
  path: string;
}) {
  const note = leagueMessageNotification(
    {
      messageId: input.messageId,
      title: input.title,
      body: input.body,
      path: input.path,
    },
    site()
  );
  const ids = await listLeaguePlayerIds(input.leagueId);
  return notifyPlayers(new Map(ids.map((id) => [id, note])));
}
