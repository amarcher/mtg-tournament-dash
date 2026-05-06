import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { games, players } from "@/db/schema";
import {
  getCurrentRound,
  getEvent,
  getEventStandings,
  getRoundMatches,
} from "@/db/queries";
import { qrDataUrl } from "@/lib/qr";
import { BroadcastClient, type BroadcastMatch } from "./BroadcastClient";

export const dynamic = "force-dynamic";

export default async function BroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const standings = await getEventStandings(id);
  const round = await getCurrentRound(id);

  let matchData: BroadcastMatch[] = [];
  if (round) {
    const ms = await getRoundMatches(round.id);
    matchData = await Promise.all(
      ms.map(async ({ match, playerA, playerB }) => {
        const allGames = await db
          .select()
          .from(games)
          .where(eq(games.matchId, match.id))
          .orderBy(games.gameNumber);
        const activeGame =
          allGames.find((g) => g.winnerId === null) ??
          allGames[allGames.length - 1] ??
          null;
        const aWins = allGames.filter(
          (g) => g.winnerId === match.playerAId
        ).length;
        const bWins = match.playerBId
          ? allGames.filter((g) => g.winnerId === match.playerBId).length
          : 0;
        return {
          matchId: match.id,
          tableNumber: match.tableNumber,
          status: match.status,
          winnerId: match.winnerId,
          playerA: {
            id: playerA.id,
            name: playerA.displayName,
            life: activeGame?.playerALife ?? event.startingLife,
            wins: aWins,
            avatars: {
              fresh: playerA.avatarUrl,
              wounded: playerA.avatarWoundedUrl,
              critical: playerA.avatarCriticalUrl,
            },
          },
          playerB: playerB
            ? {
                id: playerB.id,
                name: playerB.displayName,
                life: activeGame?.playerBLife ?? event.startingLife,
                wins: bWins,
                avatars: {
                  fresh: playerB.avatarUrl,
                  wounded: playerB.avatarWoundedUrl,
                  critical: playerB.avatarCriticalUrl,
                },
              }
            : null,
          activeGameId: activeGame?.id ?? null,
        };
      })
    );
  }

  // Pre-load all players (for fallback names if standings is empty).
  void (await db.select().from(players));

  // Compute the absolute claim URL from the actual incoming request so the QR
  // resolves to whatever phones can reach (LAN IP in dev, vercel domain in
  // prod) — not localhost or a hard-coded base.
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? `localhost:3002`;
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const claimUrl = `${proto}://${host}/events/${id}/claim`;
  const claimQr = await qrDataUrl(claimUrl);

  return (
    <BroadcastClient
      eventId={id}
      event={{
        name: event.name,
        totalRounds: event.totalRounds,
        startingLife: event.startingLife,
        roundDurationSec: event.roundDurationSec,
      }}
      currentRoundNumber={round?.roundNumber ?? null}
      roundStartedAtIso={round?.startedAt?.toISOString() ?? null}
      initialMatches={matchData}
      initialStandings={standings.map((s) => ({
        playerId: s.playerId,
        displayName: s.displayName,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        matchPoints: s.matchPoints,
        currentElo: s.currentElo,
        avatarUrl: s.avatarUrl,
      }))}
      claimUrl={claimUrl}
      claimQrDataUrl={claimQr}
      claimHostLabel={host}
    />
  );
}
