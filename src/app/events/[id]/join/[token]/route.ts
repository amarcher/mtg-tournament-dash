import { NextResponse } from "next/server";
import { setPlayerCookie } from "@/lib/auth";
import { getEventPlayerByToken } from "@/db/queries";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; token: string }> }
) {
  const { id, token } = await ctx.params;
  const ep = await getEventPlayerByToken(token);
  if (!ep || ep.eventId !== id) {
    // Old/mistyped link — send the player to the claim page (which 404s if
    // the event itself doesn't exist) instead of dead-ending on raw JSON.
    return NextResponse.redirect(
      new URL(`/events/${id}/claim?badlink=1`, _req.url)
    );
  }
  await setPlayerCookie(id, token);
  const url = new URL(`/events/${id}/play`, _req.url);
  return NextResponse.redirect(url);
}
