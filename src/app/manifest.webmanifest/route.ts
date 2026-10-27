import type { MetadataRoute } from "next";
import { getLeague } from "@/db/queries";
import { getCurrentLeaguePlayer, listCookieLeagueIds } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Served as a route handler rather than the `manifest.ts` convention so the
 * root layout can link it with `crossorigin="use-credentials"`: that is what
 * makes browsers send cookies with the manifest fetch, which is what lets
 * `start_url` be personalized (see startUrl below).
 */
export async function GET() {
  const manifest: MetadataRoute.Manifest = {
    // A stable id keeps the installed app the same app no matter which
    // start_url it was installed with.
    id: "/",
    name: "MTG Dash",
    short_name: "MTG",
    description:
      "House tournament tracker — Swiss pairings, live life totals, AI wizard portraits.",
    start_url: await startUrl(),
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0a07",
    theme_color: "#0d0a07",
    icons: [
      { src: "/icon/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
  return Response.json(manifest, {
    headers: {
      "content-type": "application/manifest+json",
      "cache-control": "no-store",
    },
  });
}

/**
 * The browser fetches the manifest with the page's cookies when the player
 * taps "Add to Home Screen", but on iOS the installed app then opens with an
 * empty cookie jar. Pointing start_url at the resume route for a league this
 * browser already plays in carries that identity across.
 */
async function startUrl(): Promise<string> {
  for (const leagueId of await listCookieLeagueIds()) {
    const player = await getCurrentLeaguePlayer(leagueId);
    if (!player) continue;
    const league = await getLeague(leagueId);
    if (league) return `/leagues/${league.slug}/resume/${player.leagueToken}`;
  }
  return "/";
}
