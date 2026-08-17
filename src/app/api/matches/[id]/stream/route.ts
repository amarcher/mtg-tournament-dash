import { channelForMatch } from "@/lib/realtime-schema";
import { sseResponseForChannel } from "@/lib/sse";

// Bonus-game live updates. Same shape as the event stream, on the per-match
// channel. Unauthenticated like the event stream — match ids are unguessable
// UUIDs and the payloads are life totals, not secrets.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  return sseResponseForChannel(channelForMatch(id), req);
}
