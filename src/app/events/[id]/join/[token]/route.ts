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
    return NextResponse.json({ error: "invalid token" }, { status: 404 });
  }
  await setPlayerCookie(id, token);
  const url = new URL(`/events/${id}/play`, _req.url);
  return NextResponse.redirect(url);
}
