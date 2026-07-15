import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { db } from "./client";
import {
  datePolls,
  eloChanges,
  eventPlayers,
  events,
  games,
  leagues,
  matches,
  players,
  pollOptions,
  pollVotes,
  rounds,
  type PollVote,
} from "./schema";
import {
  compareByMtgTiebreakers,
  computeTiebreakers,
  type PlayerMatchRecord,
} from "@/lib/tiebreakers";

export async function listLeagues() {
  return db.select().from(leagues).orderBy(asc(leagues.name));
}

export async function getLeagueBySlug(slug: string) {
  const [row] = await db.select().from(leagues).where(eq(leagues.slug, slug));
  return row ?? null;
}

export async function getLeague(leagueId: string) {
  const [row] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, leagueId));
  return row ?? null;
}

export async function listLeaguePlayers(leagueId: string) {
  return db
    .select()
    .from(players)
    .where(eq(players.leagueId, leagueId))
    .orderBy(desc(players.currentElo));
}

export async function listOpenLeagueEvents(leagueId: string) {
  return db
    .select()
    .from(events)
    .where(
      and(eq(events.leagueId, leagueId), sql`${events.status} <> 'complete'`)
    )
    .orderBy(desc(events.createdAt));
}

export async function listLeagueEvents(leagueId: string) {
  return db
    .select()
    .from(events)
    .where(eq(events.leagueId, leagueId))
    .orderBy(desc(events.createdAt));
}

/**
 * Clear `wizard_job_started_at` on any row whose job started more than 6
 * minutes ago AND still has no avatar URL. A successful generation always
 * sets `avatar_url` before clearing the flag, so the combined predicate
 * leaves healthy in-progress jobs alone — even slow ones — while reaping
 * jobs that died mid-flight (Vercel function-duration kill, container
 * crash, FLUX hang past the per-fetch timeout). Returns the number of
 * rows cleared so callers can surface a "generation failed — try again"
 * banner if they care.
 */
export async function sweepStaleWizardJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 6 * 60_000);
  const cleared = await db
    .update(players)
    .set({
      wizardJobStartedAt: null,
      wizardJobError:
        "Generation timed out after 6 minutes. The image-gen server may have been unreachable — try again.",
    })
    .where(
      and(
        lt(players.wizardJobStartedAt, cutoff),
        isNull(players.avatarUrl)
      )
    )
    .returning({ id: players.id });
  return cleared.length;
}

export async function getPlayerByLeagueToken(token: string) {
  const [row] = await db
    .select()
    .from(players)
    .where(eq(players.leagueToken, token))
    .limit(1);
  return row ?? null;
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
      avatarVictoryUrl: players.avatarVictoryUrl,
      avatarDefeatUrl: players.avatarDefeatUrl,
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
        avatarVictoryUrl: players.avatarVictoryUrl,
        avatarDefeatUrl: players.avatarDefeatUrl,
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
          avatarVictoryUrl: players.avatarVictoryUrl,
          avatarDefeatUrl: players.avatarDefeatUrl,
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
 * Match ids in a round that already have at least one recorded game winner.
 * The manage view uses this to decide which in-progress tables are still
 * safely editable (swap players / revert round) versus already scoring.
 */
export async function getMatchIdsWithRecordedGames(roundId: string) {
  const rows = await db
    .select({ matchId: games.matchId })
    .from(games)
    .innerJoin(matches, eq(matches.id, games.matchId))
    .where(and(eq(matches.roundId, roundId), isNotNull(games.winnerId)));
  return [...new Set(rows.map((r) => r.matchId))];
}

/**
 * Inputs for generateSwissPairings. Unlike getEventStandings — which only
 * counts rounds whose *row* is complete, so displayed standings hold still
 * mid-round — pairing must see every match result that exists: organizers
 * routinely preview the next round before tapping "Complete round", and a
 * preview computed without those results pairs blind (July 2026 draft night
 * produced a round-1 rematch this way). Aggregates every complete match in
 * the event regardless of its round's status.
 */
export async function getPairingInputs(eventId: string) {
  const roster = await getEventRoster(eventId);
  const completedMatches = await db
    .select({ match: matches })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .where(and(eq(rounds.eventId, eventId), eq(matches.status, "complete")));

  const records = new Map(
    roster.map((p) => [
      p.playerId,
      { matchPoints: 0, opponentsFaced: [] as string[], hasHadBye: false },
    ])
  );
  for (const { match: m } of completedMatches) {
    const a = records.get(m.playerAId);
    if (!a) continue;
    if (m.playerBId === null) {
      a.matchPoints += 3;
      a.hasHadBye = true;
      continue;
    }
    const b = records.get(m.playerBId);
    if (!b) continue;
    a.opponentsFaced.push(m.playerBId);
    b.opponentsFaced.push(m.playerAId);
    if (m.isDraw) {
      a.matchPoints += 1;
      b.matchPoints += 1;
    } else if (m.winnerId === m.playerAId) {
      a.matchPoints += 3;
    } else if (m.winnerId === m.playerBId) {
      b.matchPoints += 3;
    }
  }

  return roster.map((p) => ({
    playerId: p.playerId,
    ...records.get(p.playerId)!,
  }));
}

/**
 * Match-points standings for an event so far.
 *
 * Sort order follows the MTG tournament tiebreakers (see src/lib/tiebreakers):
 *   match points > opponents' match-win % > game-win % > opponents' game-win %.
 * `currentElo` is a final stable tiebreaker beyond MTG's four — meaningful for
 * friend leagues where the math often runs out.
 *
 * Byes count as a 2-0 match win for the player but don't contribute an
 * opponent to OMW%/OGW%. Game-level wins/losses are read from the `games`
 * table; matches resolved via organizer override have their game rows
 * synthesized (see setMatchResultAction) so GW% stays meaningful.
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
      gameWins: 0,
      gameLosses: 0,
      gameDraws: 0,
      currentElo: p.currentElo,
      avatarUrl: p.avatarUrl,
      avatarWoundedUrl: p.avatarWoundedUrl,
      avatarCriticalUrl: p.avatarCriticalUrl,
      avatarVictoryUrl: p.avatarVictoryUrl,
      avatarDefeatUrl: p.avatarDefeatUrl,
      opponentsFaced: [] as string[],
      hasHadBye: false,
      opponentMatchWinPct: 0,
      gameWinPct: 0,
      opponentGameWinPct: 0,
    }));
  }

  const completedMatches = await db
    .select()
    .from(matches)
    .where(inArray(matches.roundId, completedRoundIds));

  const matchIds = completedMatches.map((m) => m.id);
  const completedGames = matchIds.length
    ? await db.select().from(games).where(inArray(games.matchId, matchIds))
    : [];

  const records = new Map<string, PlayerMatchRecord>();
  for (const p of roster) {
    records.set(p.playerId, {
      opponents: [],
      matchWins: 0,
      matchLosses: 0,
      matchDraws: 0,
      byes: 0,
      gameWins: 0,
      gameLosses: 0,
      gameDraws: 0,
    });
  }

  for (const m of completedMatches) {
    const a = records.get(m.playerAId);
    if (!a) continue;
    if (m.playerBId === null) {
      a.byes += 1;
      continue;
    }
    const b = records.get(m.playerBId);
    if (!b) continue;
    a.opponents.push(m.playerBId);
    b.opponents.push(m.playerAId);
    if (m.isDraw) {
      a.matchDraws += 1;
      b.matchDraws += 1;
    } else if (m.winnerId === m.playerAId) {
      a.matchWins += 1;
      b.matchLosses += 1;
    } else if (m.winnerId === m.playerBId) {
      b.matchWins += 1;
      a.matchLosses += 1;
    }
  }

  const matchById = new Map(completedMatches.map((m) => [m.id, m]));
  for (const g of completedGames) {
    const m = matchById.get(g.matchId);
    if (!m || m.playerBId === null) continue;
    const aRec = records.get(m.playerAId);
    const bRec = records.get(m.playerBId);
    if (!aRec || !bRec) continue;
    if (!g.winnerId) {
      // Game with no recorded winner — only counts if the match itself was
      // a draw, in which case treat the game as a draw too.
      if (m.isDraw) {
        aRec.gameDraws += 1;
        bRec.gameDraws += 1;
      }
      continue;
    }
    if (g.winnerId === m.playerAId) {
      aRec.gameWins += 1;
      bRec.gameLosses += 1;
    } else if (g.winnerId === m.playerBId) {
      bRec.gameWins += 1;
      aRec.gameLosses += 1;
    }
  }

  const tb = computeTiebreakers(records);

  return roster
    .map((p) => {
      const r = records.get(p.playerId)!;
      const t = tb.get(p.playerId)!;
      return {
        playerId: p.playerId,
        displayName: p.displayName,
        matchPoints: t.matchPoints,
        wins: r.matchWins + r.byes,
        losses: r.matchLosses,
        draws: r.matchDraws,
        gameWins: r.gameWins + r.byes * 2,
        gameLosses: r.gameLosses,
        gameDraws: r.gameDraws,
        currentElo: p.currentElo,
        avatarUrl: p.avatarUrl,
        avatarWoundedUrl: p.avatarWoundedUrl,
        avatarCriticalUrl: p.avatarCriticalUrl,
        avatarVictoryUrl: p.avatarVictoryUrl,
        avatarDefeatUrl: p.avatarDefeatUrl,
        opponentsFaced: r.opponents,
        hasHadBye: r.byes > 0,
        opponentMatchWinPct: t.opponentMatchWinPct,
        gameWinPct: t.gameWinPct,
        opponentGameWinPct: t.opponentGameWinPct,
      };
    })
    .sort((a, b) => {
      const cmp = compareByMtgTiebreakers(
        {
          matchPoints: a.matchPoints,
          matchWinPct: 0,
          gameWinPct: a.gameWinPct,
          opponentMatchWinPct: a.opponentMatchWinPct,
          opponentGameWinPct: a.opponentGameWinPct,
        },
        {
          matchPoints: b.matchPoints,
          matchWinPct: 0,
          gameWinPct: b.gameWinPct,
          opponentMatchWinPct: b.opponentMatchWinPct,
          opponentGameWinPct: b.opponentGameWinPct,
        }
      );
      if (cmp !== 0) return cmp;
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

export async function getPendingRound(eventId: string) {
  const [row] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.eventId, eventId), eq(rounds.status, "pending")))
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

/**
 * The match a player should currently be looking at on their phone.
 *
 * Looks across every round in the event for an `in_progress` match the player
 * is in. If they have one, return it — this is what makes "excused pair keeps
 * playing into the next round" work: their old match stays in_progress even
 * after the next round starts, and `/events/[id]/play` keeps showing it.
 *
 * If no match is in_progress, fall back to the player's match in the current
 * active round (e.g. a bye, or a brand-new round they're sitting out).
 */
export async function getActiveMatchForPlayer(eventId: string, playerId: string) {
  const inProgress = await db
    .select({ match: matches })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .where(
      and(
        eq(rounds.eventId, eventId),
        eq(matches.status, "in_progress"),
        sql`(${matches.playerAId} = ${playerId} OR ${matches.playerBId} = ${playerId})`
      )
    )
    .orderBy(desc(rounds.roundNumber))
    .limit(1);
  if (inProgress.length > 0) return inProgress[0].match;

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

export type MatchHistoryRow = {
  roundNumber: number;
  opponentId: string | null;
  opponentName: string | null;
  outcome: "W" | "L" | "D" | "BYE";
  /**
   * Per-match ELO delta for this player, if any. Null when the match didn't
   * generate an ELO update (byes, draws, or organizer-set draws — see
   * setMatchResultAction's "draws hold ratings constant" rule).
   */
  eloDelta: number | null;
};

/**
 * Per-player round-by-round results across every completed round in the
 * event. Drives the final-ranking screen that appears once the last round
 * closes: each wizard card shows "R1 W vs Alice / R2 L vs Bob / R3 BYE".
 *
 * Returns a plain Record (not a Map) so it serializes directly across the
 * server/client boundary.
 */
export async function getEventMatchHistory(eventId: string) {
  const completedRounds = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.eventId, eventId), eq(rounds.status, "complete")))
    .orderBy(asc(rounds.roundNumber));
  if (completedRounds.length === 0) return {} as Record<string, MatchHistoryRow[]>;

  const roundIds = completedRounds.map((r) => r.id);
  const allMatches = await db
    .select()
    .from(matches)
    .where(inArray(matches.roundId, roundIds));

  const involvedIds = new Set<string>();
  for (const m of allMatches) {
    involvedIds.add(m.playerAId);
    if (m.playerBId) involvedIds.add(m.playerBId);
  }
  const involved = involvedIds.size
    ? await db
        .select({ id: players.id, displayName: players.displayName })
        .from(players)
        .where(inArray(players.id, Array.from(involvedIds)))
    : [];
  const nameById = new Map(involved.map((p) => [p.id, p.displayName]));
  const roundById = new Map(completedRounds.map((r) => [r.id, r]));

  // Per (matchId, playerId) → ELO delta from this match. Decisive matches
  // write one eloChanges row per side; byes and draws don't write any.
  const matchIds = allMatches.map((m) => m.id);
  const eloRows = matchIds.length
    ? await db
        .select()
        .from(eloChanges)
        .where(inArray(eloChanges.matchId, matchIds))
    : [];
  const eloByKey = new Map<string, number>();
  for (const e of eloRows) {
    eloByKey.set(`${e.matchId}:${e.playerId}`, e.delta);
  }

  const out: Record<string, MatchHistoryRow[]> = {};
  const push = (pid: string, row: MatchHistoryRow) => {
    const rows = out[pid] ?? (out[pid] = []);
    rows.push(row);
  };

  for (const m of allMatches) {
    const round = roundById.get(m.roundId);
    if (!round) continue;
    if (m.playerBId === null) {
      push(m.playerAId, {
        roundNumber: round.roundNumber,
        opponentId: null,
        opponentName: null,
        outcome: "BYE",
        eloDelta: null,
      });
      continue;
    }
    let aOutcome: "W" | "L" | "D";
    let bOutcome: "W" | "L" | "D";
    if (m.isDraw) {
      aOutcome = "D";
      bOutcome = "D";
    } else if (m.winnerId === m.playerAId) {
      aOutcome = "W";
      bOutcome = "L";
    } else if (m.winnerId === m.playerBId) {
      aOutcome = "L";
      bOutcome = "W";
    } else {
      aOutcome = "D";
      bOutcome = "D";
    }
    push(m.playerAId, {
      roundNumber: round.roundNumber,
      opponentId: m.playerBId,
      opponentName: nameById.get(m.playerBId) ?? null,
      outcome: aOutcome,
      eloDelta: eloByKey.get(`${m.id}:${m.playerAId}`) ?? null,
    });
    push(m.playerBId, {
      roundNumber: round.roundNumber,
      opponentId: m.playerAId,
      opponentName: nameById.get(m.playerAId) ?? null,
      outcome: bOutcome,
      eloDelta: eloByKey.get(`${m.id}:${m.playerBId}`) ?? null,
    });
  }

  for (const rows of Object.values(out)) {
    rows.sort((a, b) => a.roundNumber - b.roundNumber);
  }
  return out;
}

/**
 * Open (not-yet-complete) events in the given league that this player is
 * rostered in, with their active match if any. Used to drive the "Open
 * scorekeeper" CTAs surfaced from the player and league pages so a phone that
 * just finished creating a wizard has an obvious path back to the score app.
 */
export async function listOpenEventsForPlayer(
  leagueId: string,
  playerId: string
) {
  const rows = await db
    .select({
      event: events,
    })
    .from(eventPlayers)
    .innerJoin(events, eq(events.id, eventPlayers.eventId))
    .where(
      and(
        eq(eventPlayers.playerId, playerId),
        eq(events.leagueId, leagueId),
        sql`${events.status} <> 'complete'`
      )
    )
    .orderBy(desc(events.createdAt));

  return Promise.all(
    rows.map(async ({ event }) => ({
      event,
      activeMatch: await getActiveMatchForPlayer(event.id, playerId),
    }))
  );
}

export async function listEloHistory(playerId: string, limit = 50) {
  return db
    .select()
    .from(eloChanges)
    .where(eq(eloChanges.playerId, playerId))
    .orderBy(desc(eloChanges.createdAt))
    .limit(limit);
}

export async function getPlayer(playerId: string) {
  const [row] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));
  return row;
}

export async function getDatePoll(pollId: string) {
  const [row] = await db
    .select()
    .from(datePolls)
    .where(eq(datePolls.id, pollId));
  return row ?? null;
}

export async function listLeaguePolls(leagueId: string) {
  return db
    .select()
    .from(datePolls)
    .where(eq(datePolls.leagueId, leagueId))
    .orderBy(desc(datePolls.createdAt));
}

export async function getLatestLeaguePoll(leagueId: string) {
  const [row] = await db
    .select()
    .from(datePolls)
    .where(
      and(
        eq(datePolls.leagueId, leagueId),
        sql`${datePolls.status} <> 'canceled'`
      )
    )
    .orderBy(desc(datePolls.createdAt))
    .limit(1);
  return row ?? null;
}

export type PollVoteRow = {
  optionId: string;
  playerId: string;
  response: PollVote["response"];
  displayName: string;
  avatarUrl: string | null;
};

/**
 * Options ordered by date, each carrying its votes with the voter's name and
 * avatar attached. Two roundtrips instead of one left join — the vote rows
 * need player columns and the Neon HTTP driver makes per-row lateral tricks
 * not worth it at friend-league scale.
 */
export async function getPollDetail(pollId: string) {
  const options = await db
    .select()
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId))
    .orderBy(asc(pollOptions.startsAt));

  const optionIds = options.map((o) => o.id);
  const votes: PollVoteRow[] = optionIds.length
    ? await db
        .select({
          optionId: pollVotes.optionId,
          playerId: pollVotes.playerId,
          response: pollVotes.response,
          displayName: players.displayName,
          avatarUrl: players.avatarUrl,
        })
        .from(pollVotes)
        .innerJoin(players, eq(players.id, pollVotes.playerId))
        .where(inArray(pollVotes.optionId, optionIds))
    : [];

  return options.map((option) => ({
    ...option,
    votes: votes.filter((v) => v.optionId === option.id),
  }));
}

export async function getLeagueHeadToHead(leagueId: string) {
  const rows = await db
    .select({
      winnerId: matches.winnerId,
      loserId: sql<string>`CASE WHEN ${matches.winnerId} = ${matches.playerAId}
        THEN ${matches.playerBId}
        ELSE ${matches.playerAId} END`,
    })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .innerJoin(events, eq(events.id, rounds.eventId))
    .where(
      and(
        eq(events.leagueId, leagueId),
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
