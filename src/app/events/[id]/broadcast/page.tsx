import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { games, players } from "@/db/schema";
import {
  getCurrentRound,
  getEvent,
  getEventMatchHistory,
  getEventRoster,
  getEventStandings,
  getRoundMatches,
} from "@/db/queries";
import { qrDataUrl } from "@/lib/qr";
import { getPublicBaseUrl } from "@/lib/public-url";
import { BroadcastClient, type BroadcastMatch } from "./BroadcastClient";
import type { FinalRankingPlayer } from "../FinalRanking";

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
  const matchHistory =
    event.status === "complete" ? await getEventMatchHistory(id) : {};
  const roster =
    event.status === "complete" ? await getEventRoster(id) : [];
  const startingEloById = new Map(
    roster.map((r) => [r.playerId, r.startingElo])
  );

  const finalRanking: FinalRankingPlayer[] =
    event.status === "complete"
      ? standings.map((s) => {
          const history = matchHistory[s.playerId] ?? [];
          const eventDelta = history.reduce(
            (acc, h) => acc + (h.eloDelta ?? 0),
            0
          );
          const startingElo = startingEloById.get(s.playerId) ?? s.currentElo;
          return {
            playerId: s.playerId,
            displayName: s.displayName,
            wins: s.wins,
            losses: s.losses,
            draws: s.draws,
            matchPoints: s.matchPoints,
            startingElo,
            endingElo: startingElo + eventDelta,
            eventEloDelta: eventDelta,
            avatars: {
              fresh: s.avatarUrl,
              wounded: s.avatarWoundedUrl,
              critical: s.avatarCriticalUrl,
              victory: s.avatarVictoryUrl,
              defeat: s.avatarDefeatUrl,
            },
            history,
          };
        })
      : [];

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
              victory: playerA.avatarVictoryUrl,
              defeat: playerA.avatarDefeatUrl,
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
                  victory: playerB.avatarVictoryUrl,
                  defeat: playerB.avatarDefeatUrl,
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

  // Phones scan this from the TV, so the QR has to encode a host they can
  // actually reach — not localhost. `getPublicBaseUrl` swaps loopback hosts
  // for the auto-detected LAN IP and respects a `PUBLIC_URL` override.
  const baseUrl = await getPublicBaseUrl();
  const claimUrl = `${baseUrl}/events/${id}/claim`;
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
      eventStatus={event.status}
      finalRanking={finalRanking}
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
      claimHostLabel={baseUrl.replace(/^https?:\/\//, "")}
    />
  );
}
