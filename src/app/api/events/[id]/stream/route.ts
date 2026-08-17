import { channelForEvent } from "@/lib/realtime-schema";
import { sseResponseForChannel } from "@/lib/sse";

// Long-lived stream — keep on Node.js runtime so we have full Web Streams +
// access to the pubsub layer (which in turn talks to Upstash Realtime over
// HTTPS, or to the in-process Map fallback in local dev).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  return sseResponseForChannel(channelForEvent(id), req);
}
