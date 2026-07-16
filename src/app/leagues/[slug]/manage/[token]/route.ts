import { NextResponse } from "next/server";
import { getLeagueBySlug } from "@/db/queries";
import { setOrganizerCookie } from "@/lib/authz";

/**
 * The organizer link: the no-login admin escape hatch. Visiting it with the
 * league's current organizer token sets the organizer cookie and unlocks the
 * manage surfaces on this device. Rotating the token from league settings
 * invalidates every previously shared link and cookie at once.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string; token: string }> }
) {
  const { slug, token } = await ctx.params;
  const league = await getLeagueBySlug(slug);
  if (!league) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (!league.organizerToken || league.organizerToken !== token) {
    return NextResponse.redirect(
      new URL(`/leagues/${slug}?badlink=1`, req.url)
    );
  }
  await setOrganizerCookie(league.id, token);
  return NextResponse.redirect(new URL(`/leagues/${slug}`, req.url));
}
