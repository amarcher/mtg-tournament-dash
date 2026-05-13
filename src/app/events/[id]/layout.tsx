import type { Metadata } from "next";
import { getEvent, getEventStandings, getLeague } from "@/db/queries";

/**
 * Per-event `<title>` / `<meta description>` / per-share OG copy. Lives at
 * the segment layout so it applies uniformly to /broadcast, /manage, /play,
 * /claim, and /join — whichever URL someone copy-pastes into iMessage will
 * unfurl with the same artwork (see opengraph-image.tsx) and the same one-
 * line summary.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) {
    return {
      title: "Event not found",
    };
  }
  const league = await getLeague(event.leagueId);
  const leagueLabel = league?.name ?? "MTG Dash";

  let description: string;
  if (event.status === "complete") {
    const standings = await getEventStandings(id);
    const winner = standings[0]?.displayName;
    description = winner
      ? `${winner} took ${event.name} in ${leagueLabel}. See the full ranking, per-round results, and ELO changes.`
      : `${event.name} — ${leagueLabel}. Final results.`;
  } else if (event.status === "active") {
    description = `${event.name} is live in ${leagueLabel}. Pairings, life totals, and round timer.`;
  } else {
    description = `${event.name} — ${leagueLabel}. Sign up via the tournament dashboard.`;
  }

  return {
    title: event.name,
    description,
    openGraph: {
      title: `${event.name} · ${leagueLabel}`,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${event.name} · ${leagueLabel}`,
      description,
    },
  };
}

export default function EventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
