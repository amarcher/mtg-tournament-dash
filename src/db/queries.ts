import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import {
  eloChanges,
  eventPlayers,
  events,
  games,
  matches,
  players,
  rounds,
} from "./schema";

export async function listAllPlayers() {
  return db.select().from(players).orderBy(desc(players.currentElo));
}

export async function listAllEvents() {
  return db.select().from(events).orderBy(desc(events.createdAt));
}

export async function getEvent(eventId: string) {
  const [row] = await db.select().from(events).where(eq(events.id, eventId));
  return row;
}

export async function getEventRoster(eventId: string) {
  return db
    .select({
      eventId: eventPlayers.eventId,
      playerId: eventPlayers.playerId,
      seed: eventPlayers.seed,
      startingElo: eventPlayers.startingElo,
      finalStanding: eventPlayers.finalStanding,
      joinToken: eventPlayers.joinToken,
      displayName: players.displayName,
      currentElo: players.currentElo,
      avatarUrl: players.avatarUrl,
      avatarWoundedUrl: players.avatarWoundedUrl,
      avatarCriticalUrl: players.avatarCriticalUrl,
    })
    .from(eventPlayers)
    .innerJoin(players, eq(players.id, eventPlayers.playerId))
    .where(eq(eventPlayers.eventId, eventId))
    .orderBy(asc(eventPlayers.seed));
}

export async function getEventRounds(eventId: string) {
  return db
    .select()
    .from(rounds)
    .where(eq(rounds.eventId, eventId))
    .orderBy(asc(rounds.roundNumber));
}

export async function getRoundMatches(roundId: string) {
  const rows = await db
    .select({
      match: matches,
      playerA: {
        id: players.id,
        displayName: players.displayName,
        currentElo: players.currentElo,
        avatarUrl: players.avatarUrl,
        avatarWoundedUrl: players.avatarWoundedUrl,
        avatarCriticalUrl: players.avatarCriticalUrl,
      },
    })
    .from(matches)
    .innerJoin(players, eq(players.id, matches.playerAId))
    .where(eq(matches.roundId, roundId))
    .orderBy(asc(matches.tableNumber));

  // Second pass: join player B (nullable, requires left join — easier in two queries).
  const playerBIds = rows
    .map((r) => r.match.playerBId)
    .filter((id): id is string => id !== null);
  const playerBs = playerBIds.length
    ? await db
        .select({
          id: players.id,
          displayName: players.displayName,
          currentElo: players.currentElo,
          avatarUrl: players.avatarUrl,
          avatarWoundedUrl: players.avatarWoundedUrl,
          avatarCriticalUrl: players.avatarCriticalUrl,
        })
        .from(players)
        .where(inArray(players.id, playerBIds))
    : [];
  const bMap = new Map(playerBs.map((p) => [p.id, p]));

  return rows.map((r) => ({
    match: r.match,
    playerA: r.playerA,
    playerB: r.match.playerBId ? bMap.get(r.match.playerBId) ?? null : null,
  }));
}

export async function getMatchGames(matchId: string) {
  return db
    .select()
    .from(games)
    .where(eq(games.matchId, matchId))
    .orderBy(asc(games.gameNumber));
}

/**
 * Match-points standings for an event so far. Win = 3, draw = 1, loss = 0.
 * Bye is treated as a 3-0 win.
 */
export async function getEventStandings(eventId: string) {
  const roster = await getEventRoster(eventId);
  const allRounds = await getEventRounds(eventId);
  const completedRoundIds = allRounds
    .filter((r) => r.status === "complete")
    .map((r) => r.id);

  if (completedRoundIds.length === 0) {
    return roster.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      matchPoints: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      currentElo: p.currentElo,
      avatarUrl: p.avatarUrl,
      avatarWoundedUrl: p.avatarWoundedUrl,
      avatarCriticalUrl: p.avatarCriticalUrl,
      opponentsFaced: [] as string[],
      hasHadBye: false,
    }));
  }

  const completedMatches = await db
    .select()
    .from(matches)
    .where(inArray(matches.roundId, completedRoundIds));

  const stats = new Map<
    string,
    {
      wins: number;
      losses: number;
      draws: number;
      opponents: Set<string>;
      bye: boolean;
    }
  >();
  for (const p of roster) {
    stats.set(p.playerId, {
      wins: 0,
      losses: 0,
      draws: 0,
      opponents: new Set(),
      bye: false,
    });
  }

  for (const m of completedMatches) {
    const a = stats.get(m.playerAId);
    if (!a) continue;
    if (m.playerBId === null) {
      // Bye → counts as a win.
      a.wins += 1;
      a.bye = true;
      continue;
    }
    const b = stats.get(m.playerBId);
    if (!b) continue;
    a.opponents.add(m.playerBId);
    b.opponents.add(m.playerAId);
    if (m.isDraw) {
      a.draws += 1;
      b.draws += 1;
    } else if (m.winnerId === m.playerAId) {
      a.wins += 1;
      b.losses += 1;
    } else if (m.winnerId === m.playerBId) {
      b.wins += 1;
      a.losses += 1;
    }
  }

  return roster
    .map((p) => {
      const s = stats.get(p.playerId)!;
      return {
        playerId: p.playerId,
        displayName: p.displayName,
        matchPoints: s.wins * 3 + s.draws * 1,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        currentElo: p.currentElo,
        avatarUrl: p.avatarUrl,
        avatarWoundedUrl: p.avatarWoundedUrl,
        avatarCriticalUrl: p.avatarCriticalUrl,
        opponentsFaced: Array.from(s.opponents),
        hasHadBye: s.bye,
      };
    })
    .sort((a, b) => {
      if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
      return b.currentElo - a.currentElo;
    });
}

export async function getCurrentRound(eventId: string) {
  const [row] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.eventId, eventId), eq(rounds.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function getEventPlayerByToken(token: string) {
  const [row] = await db
    .select({
      eventId: eventPlayers.eventId,
      playerId: eventPlayers.playerId,
      displayName: players.displayName,
    })
    .from(eventPlayers)
    .innerJoin(players, eq(players.id, eventPlayers.playerId))
    .where(eq(eventPlayers.joinToken, token))
    .limit(1);
  return row ?? null;
}

export async function getActiveMatchForPlayer(eventId: string, playerId: string) {
  const activeRound = await getCurrentRound(eventId);
  if (!activeRound) return null;
  const [row] = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.roundId, activeRound.id),
        sql`(${matches.playerAId} = ${playerId} OR ${matches.playerBId} = ${playerId})`
      )
    )
    .limit(1);
  return row ?? null;
}

export async function listEloHistory(playerId: string, limit = 50) {
  return db
    .select()
    .from(eloChanges)
    .where(eq(eloChanges.playerId, playerId))
    .orderBy(desc(eloChanges.createdAt))
    .limit(limit);
}

export async function listOpenEvents() {
  return db
    .select()
    .from(events)
    .where(sql`${events.status} <> 'complete'`)
    .orderBy(desc(events.createdAt));
}

export async function getPlayer(playerId: string) {
  const [row] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));
  return row;
}

/** Head-to-head: how many times has playerA beaten playerB? */
export async function getHeadToHeadMatrix() {
  const rows = await db
    .select({
      winnerId: matches.winnerId,
      loserId: sql<string>`CASE WHEN ${matches.winnerId} = ${matches.playerAId}
        THEN ${matches.playerBId}
        ELSE ${matches.playerAId} END`,
    })
    .from(matches)
    .where(
      and(
        eq(matches.status, "complete"),
        eq(matches.isDraw, false),
        sql`${matches.winnerId} IS NOT NULL`
      )
    );
  const matrix = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.winnerId || !r.loserId) continue;
    const inner = matrix.get(r.winnerId) ?? new Map();
    inner.set(r.loserId, (inner.get(r.loserId) ?? 0) + 1);
    matrix.set(r.winnerId, inner);
  }
  return matrix;
}
