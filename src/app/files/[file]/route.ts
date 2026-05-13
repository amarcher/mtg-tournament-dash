import { NextResponse } from "next/server";

const IMAGE_GEN_URL =
  process.env.IMAGE_GEN_URL ??
  process.env.IMAGEGEN_URL ??
  "http://127.0.0.1:8000";

// Proxy /files/<name> through to the image-gen server. Lets us store
// generated images outside Next.js's `/public` (which is baked into the
// build manifest at build time and wouldn't pick up newly written files).
//
// The same URL works from any hostname pointed at this app — `mtg.capxun.com`
// via cloudflared, the LAN IP, or localhost — because the proxy server-side
// fetch always hits the local image-gen on 127.0.0.1:8000.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ file: string }> }
) {
  const { file } = await ctx.params;
  const upstream = await fetch(`${IMAGE_GEN_URL}/files/${encodeURIComponent(file)}`, {
    cache: "no-store",
    // Forward range requests so video/audio playback works if added later.
    headers: req.headers.get("range") ? { range: req.headers.get("range")! } : {},
  });

  if (!upstream.ok) {
    return new NextResponse(`upstream ${upstream.status}`, {
      status: upstream.status,
    });
  }

  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const cc = upstream.headers.get("cache-control");
  if (cc) headers.set("cache-control", cc);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
