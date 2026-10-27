import { NextResponse } from "next/server";
import {
  getLeagueBySlug,
  getPlayerByLeagueToken,
  listOpenSeatsForPlayer,
} from "@/db/queries";
import { setLeagueCookie, setPlayerCookie } from "@/lib/auth";

/**
 * Start URL for the installed home-screen app. iOS gives an installed web app
 * a cookie jar of its own, so the identity a player built up in Safari never
 * reaches it; the personalized manifest points the icon here so the first
 * open re-issues the league cookie (plus any seats in events still running)
 * before landing them on the league, or straight into a live event.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string; token: string }> }
) {
  if (req.headers.get("next-router-prefetch")) {
    return new NextResponse(null, { status: 204 });
  }
  const { slug, token } = await ctx.params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.redirect(new URL("/", req.url));

  const player = await getPlayerByLeagueToken(token);
  if (!player || player.leagueId !== league.id) {
    return NextResponse.redirect(new URL(`/leagues/${slug}/claim`, req.url));
  }

  await setLeagueCookie(league.id, player.leagueToken);
  const seats = await listOpenSeatsForPlayer(league.id, player.id);
  for (const seat of seats) {
    await setPlayerCookie(seat.eventId, seat.joinToken);
  }
  const live = seats.find((s) => s.status === "active");
  const dest = live ? `/events/${live.eventId}/play` : `/leagues/${slug}`;
  return NextResponse.redirect(new URL(dest, req.url));
}
