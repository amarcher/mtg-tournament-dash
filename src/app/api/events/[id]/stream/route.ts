import { subscribe, type EventMessage } from "@/lib/pubsub";

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
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Flush headers immediately so the browser knows the connection is
      // alive — some proxies otherwise buffer until the first data frame.
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const send = (msg: EventMessage) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(msg)}\n\n`)
          );
        } catch {
          /* stream already closed */
        }
      };

      // Replay the last ~50 events on subscribe so a client reconnecting
      // after Vercel's 300s function-duration kill backfills the gap before
      // going live. No-op on the in-process path (Map has no history).
      const unsubscribe = await subscribe(id, send, { historyLimit: 50 });

      // Heartbeat every 25s so idle-connection killers in front of Vercel
      // (CDN, browser, intermediate proxies) don't drop the stream.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      const cleanup = async () => {
        clearInterval(heartbeat);
        try {
          await unsubscribe();
        } catch {
          /* best effort */
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", () => {
        void cleanup();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
