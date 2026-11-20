import { cookies } from "next/headers";
import {
  getEventPlayerByToken,
  getEventPlayerForUser,
  getPlayerByLeagueToken,
  getPlayerForUser,
} from "@/db/queries";
import { getSessionUser } from "@/lib/authz";
import { ownerAllows } from "@/lib/wizard-ownership";

const EVENT_COOKIE_PREFIX = "mtg_event_";
const LEAGUE_COOKIE_PREFIX = "mtg_league_";

function eventCookieName(eventId: string) {
  return `${EVENT_COOKIE_PREFIX}${eventId}`;
}

function leagueCookieName(leagueId: string) {
  return `${LEAGUE_COOKIE_PREFIX}${leagueId}`;
}

export async function setPlayerCookie(eventId: string, joinToken: string) {
  const store = await cookies();
  // Expire any cookie set under the pre-July-2026 `/events/<id>` path — a
  // same-name cookie on a more specific path would shadow the new one below.
  store.set(eventCookieName(eventId), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/events/${eventId}`,
    maxAge: 0,
  });
  // Path is "/" (not `/events/<id>`) because the phone view polls
  // `/api/events/<id>/match/<matchId>/state`, which a `/events/<id>`-scoped
  // cookie never reaches — the poll 401'd and reconnecting tabs stayed stale.
  // The cookie name is already event-scoped, so the wide path leaks nothing.
  store.set(eventCookieName(eventId), joinToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

// Both lookups below answer in two steps. The cookie is the fast path and
// the only one for an unowned wizard. An owned wizard also needs its owner's
// session (so a stale cookie or an old join link on someone else's phone
// stops working the moment the wizard is claimed), and a signed-in owner is
// recognized with no cookie at all, which is how a new phone finds its seat.
//
// A cookie for an unowned wizard beats the session on purpose: it is how an
// organizer runs a guest on their own phone, and tapping their own wizard
// again switches back.
export async function getCurrentPlayer(eventId: string) {
  const store = await cookies();
  const token = store.get(eventCookieName(eventId))?.value;
  const ep = token ? await getEventPlayerByToken(token) : null;
  const seat = ep && ep.eventId === eventId ? ep : null;
  if (seat && !seat.userId) return seat;
  const user = await getSessionUser();
  if (seat && ownerAllows(seat.userId, user?.id ?? null)) return seat;
  const own = user ? await getEventPlayerForUser(eventId, user.id) : null;
  if (!own) return null;
  // No seat cookie, but this phone may be running a guest league-wide. Then
  // it is not its owner's wizard here either, or league pages and the
  // scorekeeper would disagree about who is holding the phone; the event's
  // claim page offers the guest's seat instead.
  const leagueToken = store.get(leagueCookieName(own.leagueId))?.value;
  const acting = leagueToken ? await getPlayerByLeagueToken(leagueToken) : null;
  const runningGuest =
    acting !== null &&
    acting.leagueId === own.leagueId &&
    acting.userId === null &&
    acting.id !== own.playerId;
  return runningGuest ? null : own;
}

// League cookie is path-scoped to the whole site so it survives across events
// (events live at /events/[id]/*, not nested under /leagues/...). The cookie
// value is the player's leagueToken; we verify the matching player still
// belongs to the expected league before trusting it.
export async function setLeagueCookie(leagueId: string, leagueToken: string) {
  const store = await cookies();
  store.set(leagueCookieName(leagueId), leagueToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // 1 year — durable identity within a friend group.
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearLeagueCookie(leagueId: string) {
  const store = await cookies();
  store.delete(leagueCookieName(leagueId));
}

export async function getCurrentLeaguePlayer(leagueId: string) {
  const store = await cookies();
  const token = store.get(leagueCookieName(leagueId))?.value;
  const found = token ? await getPlayerByLeagueToken(token) : null;
  const player = found && found.leagueId === leagueId ? found : null;
  if (player && !player.userId) return player;
  const user = await getSessionUser();
  if (player && ownerAllows(player.userId, user?.id ?? null)) return player;
  return user ? getPlayerForUser(leagueId, user.id) : null;
}

/**
 * League ids this browser holds a guest league cookie for — powers the
 * zero-login "Your leagues" section on the home page. Ids only; the tokens
 * themselves are verified by getCurrentLeaguePlayer when it matters.
 */
export async function listCookieLeagueIds(): Promise<string[]> {
  const store = await cookies();
  return store
    .getAll()
    .filter((c) => c.name.startsWith(LEAGUE_COOKIE_PREFIX) && c.value)
    .map((c) => c.name.slice(LEAGUE_COOKIE_PREFIX.length));
}

export function generateJoinToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
