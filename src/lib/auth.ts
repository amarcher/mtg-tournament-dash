import { cookies } from "next/headers";
import {
  getEventPlayerByToken,
  getPlayerByLeagueToken,
} from "@/db/queries";

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
  store.set(eventCookieName(eventId), joinToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/events/${eventId}`,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getCurrentPlayer(eventId: string) {
  const store = await cookies();
  const token = store.get(eventCookieName(eventId))?.value;
  if (!token) return null;
  const ep = await getEventPlayerByToken(token);
  if (!ep || ep.eventId !== eventId) return null;
  return ep;
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
  if (!token) return null;
  const player = await getPlayerByLeagueToken(token);
  if (!player || player.leagueId !== leagueId) return null;
  return player;
}

export function generateJoinToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
