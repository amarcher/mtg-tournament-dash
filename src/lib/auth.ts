import { cookies } from "next/headers";
import { getEventPlayerByToken } from "@/db/queries";

const COOKIE_PREFIX = "mtg_event_";

function cookieName(eventId: string) {
  return `${COOKIE_PREFIX}${eventId}`;
}

export async function setPlayerCookie(eventId: string, joinToken: string) {
  const store = await cookies();
  store.set(cookieName(eventId), joinToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/events/${eventId}`,
    // 30 days — plenty for a single tournament.
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getCurrentPlayer(eventId: string) {
  const store = await cookies();
  const token = store.get(cookieName(eventId))?.value;
  if (!token) return null;
  const ep = await getEventPlayerByToken(token);
  if (!ep || ep.eventId !== eventId) return null;
  return ep;
}

export function generateJoinToken(): string {
  // 192 bits of randomness, base64url-encoded.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
