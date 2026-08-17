import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { events, leagues, matches, rounds } from "@/db/schema";
import { getLeagueMembership } from "@/db/queries";
import { auth } from "@/lib/user-auth";
import { evaluateOrganizerAccess } from "@/lib/authz-core";
import type { Event, League, Match, Round } from "@/db/schema";

const ORGANIZER_COOKIE_PREFIX = "mtg_org_";

function organizerCookieName(leagueId: string) {
  return `${ORGANIZER_COOKIE_PREFIX}${leagueId}`;
}

/**
 * True inside an HTTP request, false when a trusted local script (verify)
 * drives actions in-process. Same convention as the swallowing revalidatePath
 * wrapper in src/app/events/actions.ts — cookies() throws outside a request
 * scope, and no network caller can reach that state.
 */
async function hasRequestScope(): Promise<boolean> {
  try {
    await cookies();
    return true;
  } catch {
    return false;
  }
}

export async function getSessionUser(): Promise<{
  id: string;
  email: string;
  name: string | null;
} | null> {
  let requestHeaders: Headers;
  try {
    requestHeaders = await headers();
  } catch {
    return null;
  }
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
  };
}

/**
 * Drop every no-login organizer grant on this device. Sign-out must call
 * this alongside the better-auth signOut: the `mtg_org_*` cookies are
 * checked before any session lookup, so leaving them behind would keep the
 * device fully authorized after "Sign out".
 */
export async function clearOrganizerCookies() {
  const store = await cookies();
  for (const c of store.getAll()) {
    if (c.name.startsWith(ORGANIZER_COOKIE_PREFIX)) store.delete(c.name);
  }
}

export async function setOrganizerCookie(leagueId: string, token: string) {
  const store = await cookies();
  store.set(organizerCookieName(leagueId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

async function checkOrganizerAccess(league: League): Promise<boolean> {
  if (!(await hasRequestScope())) return true;
  const store = await cookies();
  const cookieToken = store.get(organizerCookieName(league.id))?.value ?? null;
  // Cookie match needs no session lookup — check it before hitting the DB.
  if (
    evaluateOrganizerAccess({
      hasRequestScope: true,
      sessionUserId: null,
      ownerUserId: league.ownerUserId,
      membershipRole: null,
      cookieOrganizerToken: cookieToken,
      leagueOrganizerToken: league.organizerToken,
    })
  ) {
    return true;
  }
  const sessionUser = await getSessionUser();
  if (!sessionUser) return false;
  const membership = await getLeagueMembership(league.id, sessionUser.id);
  return evaluateOrganizerAccess({
    hasRequestScope: true,
    sessionUserId: sessionUser.id,
    ownerUserId: league.ownerUserId,
    membershipRole: membership?.role ?? null,
    cookieOrganizerToken: cookieToken,
    leagueOrganizerToken: league.organizerToken,
  });
}

export async function isLeagueOrganizer(
  leagueOrId: League | string
): Promise<boolean> {
  const league =
    typeof leagueOrId === "string"
      ? (
          await db.select().from(leagues).where(eq(leagues.id, leagueOrId))
        )[0] ?? null
      : leagueOrId;
  if (!league) return false;
  return checkOrganizerAccess(league);
}

const DENIED_MESSAGE =
  "Organizer access required. Sign in as a league manager, or open this page through the organizer link.";

export async function requireOrganizer(leagueOrId: League | string) {
  if (!(await isLeagueOrganizer(leagueOrId))) {
    throw new Error(DENIED_MESSAGE);
  }
}

/** Resolves the event and authorizes in one call; returns the row for reuse. */
export async function requireOrganizerForEvent(
  eventId: string
): Promise<Event> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");
  await requireOrganizer(event.leagueId);
  return event;
}

export async function requireOrganizerForRound(
  // Null shows up when a caller hands us a bonus game's roundId — organizer
  // tooling has no business touching those, so reject rather than widen.
  roundId: string | null
): Promise<Round> {
  if (!roundId) throw new Error("Bonus games have no round to manage");
  const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
  if (!round) throw new Error("Round not found");
  await requireOrganizerForEvent(round.eventId);
  return round;
}

export async function requireOrganizerForMatch(
  matchId: string
): Promise<Match> {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId));
  if (!match) throw new Error("Match not found");
  await requireOrganizerForRound(match.roundId);
  return match;
}
