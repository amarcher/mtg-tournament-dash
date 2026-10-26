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
  getPendingRound,
  getRoundMatches,
} from "@/db/queries";
import { draftSeatOrder } from "@/lib/draft-seating";
import {
  computeTeamStandings,
  splitTeams,
  teamDraftSeatOrder,
  teamNamesFor,
} from "@/lib/team-draft";
import { qrDataUrl } from "@/lib/qr";
import { getPublicBaseUrl } from "@/lib/public-url";
import { BroadcastClient, type BroadcastMatch } from "./BroadcastClient";
import type { FinalRankingPlayer } from "../FinalRanking";
import type { DraftSeat } from "../DraftSeating";

export const dynamic = "force-dynamic";

export default async function BroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const isTeamDraft = event.format === "team_draft";
  const standings = await getEventStandings(id);
  const round = await getCurrentRound(id);
  const matchHistory =
    event.status === "complete" ? await getEventMatchHistory(id) : {};
  // The roster is also the source of team sides for the pre-round seating.
  const roster =
    event.status === "complete" || isTeamDraft ? await getEventRoster(id) : [];
  const startingEloById = new Map(
    roster.map((r) => [r.playerId, r.startingElo])
  );
  const teamByPlayer = new Map(roster.map((r) => [r.playerId, r.team]));
  const teams = isTeamDraft
    ? { names: teamNamesFor(event), score: computeTeamStandings(standings) }
    : null;

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
            team: s.team,
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
            team: teamByPlayer.get(playerA.id) ?? null,
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
                team: teamByPlayer.get(playerB.id) ?? null,
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

  // Before the event starts, previewed round-1 pairings double as the draft
  // pod's seating chart — the TV shows who sits where, not who plays whom.
  let draftSeats: DraftSeat[] = [];
  if (!round && event.status === "draft" && isTeamDraft) {
    // Team draft seating doesn't depend on pairings — alternate the sides
    // as soon as the organizer has placed everyone.
    const split = splitTeams(roster);
    if (split.unassigned.length === 0 && split.a.length > 0 && split.b.length > 0) {
      const byId = new Map(roster.map((r) => [r.playerId, r]));
      draftSeats = teamDraftSeatOrder(
        split.a.map((r) => r.playerId),
        split.b.map((r) => r.playerId)
      ).map((pid) => {
        const r = byId.get(pid)!;
        return {
          playerId: r.playerId,
          name: r.displayName,
          avatarUrl: r.avatarUrl,
          team: r.team,
        };
      });
    }
  } else if (!round && event.status === "draft") {
    const pending = await getPendingRound(id);
    if (pending?.roundNumber === 1) {
      const pendingMatches = await getRoundMatches(pending.id);
      const byId = new Map<string, DraftSeat>();
      for (const { playerA, playerB } of pendingMatches) {
        for (const p of [playerA, playerB]) {
          if (p)
            byId.set(p.id, {
              playerId: p.id,
              name: p.displayName,
              avatarUrl: p.avatarUrl,
            });
        }
      }
      draftSeats = draftSeatOrder(
        pendingMatches.map(({ match }) => match)
      ).map((pid) => byId.get(pid)!);
    }
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
        setName: event.setName,
      }}
      draftSeats={draftSeats}
      teams={teams}
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
        team: s.team,
      }))}
      claimUrl={claimUrl}
      claimQrDataUrl={claimQr}
      claimHostLabel={baseUrl.replace(/^https?:\/\//, "")}
    />
  );
}
