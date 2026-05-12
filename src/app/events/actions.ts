"use server";

import { revalidatePath as _revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Revalidation is a side effect tied to the request scope; if we're called
// outside a request (e.g. from a smoke-test script), silently no-op rather
// than crash.
function revalidatePath(path: string) {
  try {
    _revalidatePath(path);
  } catch {
    /* no-op outside request context */
  }
}
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  eloChanges,
  eventPlayers,
  events,
  games,
  matches,
  players,
  rounds,
} from "@/db/schema";
import {
  getCurrentRound,
  getEventStandings,
  getRoundMatches,
} from "@/db/queries";
import { generateSwissPairings } from "@/lib/pairings/swiss";
import { computeMatchElo } from "@/lib/elo";
import { leagues } from "@/db/schema";
import {
  generateJoinToken,
  setLeagueCookie,
  setPlayerCookie,
} from "@/lib/auth";
import { publish } from "@/lib/pubsub";
import {
  generateWizardVariantsFromSelfie,
} from "@/lib/wizard";
import {
  WIZARD_ARCHETYPES,
  type WizardArchetype,
} from "@/lib/wizard-types";

export async function createEventAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const totalRounds = Number(formData.get("totalRounds") ?? 3);
  const startingLife = Number(formData.get("startingLife") ?? 20);
  const playerIds = formData.getAll("playerId").map(String).filter(Boolean);

  if (!leagueId) throw new Error("League required");
  if (!name) throw new Error("Event name required");
  if (playerIds.length < 2) throw new Error("Need at least 2 players");

  const leaguePlayers = await db
    .select()
    .from(players)
    .where(eq(players.leagueId, leagueId));
  const leaguePlayerIds = new Set(leaguePlayers.map((p) => p.id));
  for (const pid of playerIds) {
    if (!leaguePlayerIds.has(pid)) {
      throw new Error("Player not in this league");
    }
  }

  const [created] = await db
    .insert(events)
    .values({ leagueId, name, totalRounds, startingLife })
    .returning();

  const eloByPlayer = new Map(leaguePlayers.map((p) => [p.id, p.currentElo]));

  await db.insert(eventPlayers).values(
    playerIds.map((pid, idx) => ({
      eventId: created.id,
      playerId: pid,
      seed: idx + 1,
      startingElo: eloByPlayer.get(pid) ?? 1200,
      joinToken: generateJoinToken(),
    }))
  );

  redirect(`/events/${created.id}/manage`);
}

export async function addPlayerAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!leagueId) throw new Error("League required");
  if (!name) throw new Error("Player name required");
  await db.insert(players).values({
    leagueId,
    leagueToken: generateJoinToken(),
    displayName: name,
  });
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, leagueId));
  if (league) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/claim`);
    revalidatePath(`/leagues/${league.slug}/events/new`);
  }
  revalidatePath("/");
}

/**
 * Self-service identity creation from the league claim page. Creates a player
 * in the league, sets the league cookie, and redirects to wizardize (or the
 * league home if the caller asks).
 */
export async function createLeaguePlayerAction(formData: FormData) {
  const leagueSlug = String(formData.get("leagueSlug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!leagueSlug) throw new Error("League required");
  if (!name) throw new Error("Display name required");

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.slug, leagueSlug));
  if (!league) throw new Error("League not found");

  const token = generateJoinToken();
  const [player] = await db
    .insert(players)
    .values({
      leagueId: league.id,
      leagueToken: token,
      displayName: name,
    })
    .returning();

  await setLeagueCookie(league.id, token);
  redirect(`/players/${player.id}`);
}

/**
 * Tap an existing wizard card on the league claim page to claim that identity.
 * Sets the league cookie so subsequent visits in this league recognize the
 * player automatically.
 */
export async function claimLeaguePlayerAction(formData: FormData) {
  const leagueSlug = String(formData.get("leagueSlug") ?? "").trim();
  const playerId = String(formData.get("playerId") ?? "").trim();
  if (!leagueSlug) throw new Error("League required");
  if (!playerId) throw new Error("Player required");

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.slug, leagueSlug));
  if (!league) throw new Error("League not found");

  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.leagueId, league.id)));
  if (!player) throw new Error("Player is not in this league");

  await setLeagueCookie(league.id, player.leagueToken);
  redirect(`/leagues/${league.slug}`);
}

export async function generateWizardAction(formData: FormData) {
  const playerId = String(formData.get("playerId") ?? "");
  const archetypeRaw = String(formData.get("archetype") ?? "archmage");
  const freeform = String(formData.get("freeform") ?? "");
  const selfie = formData.get("selfie");

  if (!playerId) throw new Error("playerId required");
  if (!(selfie instanceof File) || selfie.size === 0)
    throw new Error("Selfie file required");
  if (selfie.size > 12 * 1024 * 1024)
    throw new Error("Selfie too large (max 12 MB)");

  const archetype = (
    WIZARD_ARCHETYPES as readonly string[]
  ).includes(archetypeRaw)
    ? (archetypeRaw as WizardArchetype)
    : ("archmage" as WizardArchetype);

  // Mark "generation in progress" so the page can show a polling state.
  // We blank out the avatar columns so the UI doesn't show the stale wizard
  // while the new one is being generated.
  await db
    .update(players)
    .set({
      wizardArchetype: archetype,
      wizardJobStartedAt: new Date(),
      avatarUrl: null,
      avatarWoundedUrl: null,
      avatarCriticalUrl: null,
      avatarVictoryUrl: null,
      avatarDefeatUrl: null,
    })
    .where(eq(players.id, playerId));

  // Capture the selfie bytes synchronously — the File reference is tied to
  // the form-data parser's request lifetime and can't be read after this
  // function returns. The Buffer copy survives the background job.
  const selfieBuffer = Buffer.from(await selfie.arrayBuffer());
  const selfieType = selfie.type || "image/jpeg";

  // Background the FLUX + upload work (~90 s) so the server action returns
  // quickly. Cloudflare's free-tier edge has a 100 s HTTP response timeout
  // and would cut the connection mid-generation otherwise. The page polls
  // for completion via the `wizardJobStartedAt` column going null again.
  void (async () => {
    try {
      const reconstituted = new File(
        [new Uint8Array(selfieBuffer)],
        "selfie",
        { type: selfieType }
      );
      const {
        selfiePath,
        freshPath,
        woundedPath,
        criticalPath,
        victoryPath,
        defeatPath,
      } = await generateWizardVariantsFromSelfie({
        playerId,
        selfie: reconstituted,
        archetype,
        freeform,
      });
      await db
        .update(players)
        .set({
          avatarUrl: freshPath,
          avatarWoundedUrl: woundedPath,
          avatarCriticalUrl: criticalPath,
          avatarVictoryUrl: victoryPath,
          avatarDefeatUrl: defeatPath,
          selfieUrl: selfiePath,
          wizardArchetype: archetype,
          wizardJobStartedAt: null,
        })
        .where(eq(players.id, playerId));
    } catch (err) {
      console.error("[wizardize] background job failed:", err);
      // Clear the in-progress flag so the UI doesn't hang forever. The
      // user can retry from the same page.
      await db
        .update(players)
        .set({ wizardJobStartedAt: null })
        .where(eq(players.id, playerId));
    }
  })();

  revalidatePath(`/players/${playerId}`);
}

export async function startNextRoundAction(eventId: string) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");

  const existingRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.eventId, eventId));

  if (existingRounds.some((r) => r.status === "active")) {
    throw new Error("There's already an active round");
  }
  if (existingRounds.length >= event.totalRounds) {
    throw new Error("All rounds have been played");
  }

  const standings = await getEventStandings(eventId);
  const pairings = generateSwissPairings(
    standings.map((s) => ({
      playerId: s.playerId,
      matchPoints: s.matchPoints,
      opponentsFaced: s.opponentsFaced,
      hasHadBye: s.hasHadBye,
    }))
  );

  const roundNumber = existingRounds.length + 1;
  const [newRound] = await db
    .insert(rounds)
    .values({
      eventId,
      roundNumber,
      status: "active",
      startedAt: new Date(),
    })
    .returning();

  if (event.status === "draft") {
    await db
      .update(events)
      .set({ status: "active" })
      .where(eq(events.id, eventId));
  }

  const newMatches = await db
    .insert(matches)
    .values(
      pairings.map((p) => ({
        roundId: newRound.id,
        tableNumber: p.tableNumber,
        playerAId: p.playerAId,
        playerBId: p.playerBId,
        status:
          p.playerBId === null
            ? ("complete" as const)
            : ("in_progress" as const),
        winnerId: p.playerBId === null ? p.playerAId : null,
        completedAt: p.playerBId === null ? new Date() : null,
      }))
    )
    .returning();

  const realMatches = newMatches.filter((m) => m.playerBId !== null);
  if (realMatches.length > 0) {
    await db.insert(games).values(
      realMatches.map((m) => ({
        matchId: m.id,
        gameNumber: 1,
        playerALife: event.startingLife,
        playerBLife: event.startingLife,
      }))
    );
  }

  publish(eventId, { type: "round_started", roundNumber });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/broadcast`);
  revalidatePath(`/events/${eventId}/play`);
}

export async function completeRoundAction(eventId: string) {
  const round = await getCurrentRound(eventId);
  if (!round) throw new Error("No active round");

  const ms = await getRoundMatches(round.id);
  const incomplete = ms.filter((r) => r.match.status !== "complete");
  if (incomplete.length > 0) {
    throw new Error(`${incomplete.length} match(es) still in progress`);
  }

  await db
    .update(rounds)
    .set({ status: "complete", completedAt: new Date() })
    .where(eq(rounds.id, round.id));

  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  const completed = (
    await db.select().from(rounds).where(eq(rounds.eventId, eventId))
  ).filter((r) => r.status === "complete").length;

  if (completed >= event.totalRounds) {
    const standings = await getEventStandings(eventId);
    for (let i = 0; i < standings.length; i++) {
      await db
        .update(eventPlayers)
        .set({ finalStanding: i + 1 })
        .where(
          and(
            eq(eventPlayers.eventId, eventId),
            eq(eventPlayers.playerId, standings[i].playerId)
          )
        );
    }
    await db
      .update(events)
      .set({ status: "complete" })
      .where(eq(events.id, eventId));
  }

  publish(eventId, { type: "round_completed", roundNumber: round.roundNumber });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/broadcast`);
}

/* ---- in-match mutations (called from phone view) ---- */

export async function adjustLifeAction(args: {
  matchId: string;
  side: "a" | "b";
  delta: number;
}) {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, args.matchId));
  if (!match || match.status !== "in_progress")
    throw new Error("Match not in progress");

  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.matchId, args.matchId), isNull(games.winnerId)))
    .orderBy(games.gameNumber)
    .limit(1);
  if (!game) throw new Error("No active game");

  const current = args.side === "a" ? game.playerALife : game.playerBLife;
  const next = current + args.delta;

  await db
    .update(games)
    .set(args.side === "a" ? { playerALife: next } : { playerBLife: next })
    .where(eq(games.id, game.id));

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, match.roundId));
  publish(round.eventId, {
    type: "life_changed",
    matchId: args.matchId,
    gameId: game.id,
    side: args.side,
    life: next,
  });

  return { life: next };
}

export async function reportGameWinnerAction(args: {
  matchId: string;
  winnerId: string;
}) {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, args.matchId));
  if (!match) throw new Error("Match not found");
  // Touch UIs double-fire all the time; swallow late calls instead of
  // crashing the player view. The first call already produced the state the
  // user intended.
  if (match.status === "complete") return;

  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.matchId, args.matchId), isNull(games.winnerId)))
    .orderBy(games.gameNumber)
    .limit(1);
  // Same idempotency reasoning — if there's no open game, no-op.
  if (!game) return;

  await db
    .update(games)
    .set({ winnerId: args.winnerId, completedAt: new Date() })
    .where(eq(games.id, game.id));

  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.matchId, args.matchId));
  const aWins = allGames.filter((g) => g.winnerId === match.playerAId).length;
  const bWins = allGames.filter((g) => g.winnerId === match.playerBId).length;

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, match.roundId));
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, round.eventId));

  if (aWins >= 2 || bWins >= 2) {
    const winnerId = aWins >= 2 ? match.playerAId : match.playerBId!;
    await db
      .update(matches)
      .set({ status: "complete", winnerId, completedAt: new Date() })
      .where(eq(matches.id, match.id));

    if (match.playerBId) {
      const [a] = await db
        .select()
        .from(players)
        .where(eq(players.id, match.playerAId));
      const [b] = await db
        .select()
        .from(players)
        .where(eq(players.id, match.playerBId));
      const elo = computeMatchElo({
        playerAId: a.id,
        playerARating: a.currentElo,
        playerBId: b.id,
        playerBRating: b.currentElo,
        winnerId,
      });
      await db.insert(eloChanges).values([
        {
          matchId: match.id,
          playerId: a.id,
          before: elo.playerA.before,
          after: elo.playerA.after,
          delta: elo.playerA.delta,
        },
        {
          matchId: match.id,
          playerId: b.id,
          before: elo.playerB.before,
          after: elo.playerB.after,
          delta: elo.playerB.delta,
        },
      ]);
      await db
        .update(players)
        .set({ currentElo: elo.playerA.after })
        .where(eq(players.id, a.id));
      await db
        .update(players)
        .set({ currentElo: elo.playerB.after })
        .where(eq(players.id, b.id));
    }
    publish(event.id, {
      type: "match_complete",
      matchId: match.id,
      winnerId,
    });
  } else {
    const nextGameNumber = allGames.length + 1;
    await db.insert(games).values({
      matchId: match.id,
      gameNumber: nextGameNumber,
      playerALife: event.startingLife,
      playerBLife: event.startingLife,
    });
    publish(event.id, {
      type: "game_complete",
      matchId: match.id,
      winnerId: args.winnerId,
      nextGameNumber,
    });
  }

  revalidatePath(`/events/${event.id}/play`);
  revalidatePath(`/events/${event.id}/broadcast`);
  revalidatePath(`/events/${event.id}/manage`);
}

/**
 * Organizer override: directly finalize a match. Used when results came in
 * verbally rather than through the phone UI (or when time runs out and the
 * organizer wants to call it). Skips the per-game tracking and goes straight
 * to a complete match + ELO update.
 */
export async function setMatchResultAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const outcome = String(formData.get("outcome") ?? ""); // "a" | "b" | "draw"

  if (!matchId) throw new Error("matchId required");
  if (outcome !== "a" && outcome !== "b" && outcome !== "draw") {
    throw new Error("Invalid outcome");
  }

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) throw new Error("Match not found");
  if (match.status === "complete")
    throw new Error("Match is already complete");
  if (match.playerBId === null)
    throw new Error("Cannot override a bye");

  const isDraw = outcome === "draw";
  const winnerId = isDraw
    ? null
    : outcome === "a"
      ? match.playerAId
      : match.playerBId;

  await db
    .update(matches)
    .set({
      status: "complete",
      winnerId,
      isDraw,
      completedAt: new Date(),
    })
    .where(eq(matches.id, match.id));

  // Synthesize game rows for decisive overrides so MTG game-win% tiebreakers
  // still mean something on mixed-input tournaments (some matches reported via
  // phone, some called by the organizer). Assume a 2-0 BO3 sweep — the most
  // common outcome. For draws, leave game rows untouched: the actual game
  // state is genuinely unknown, and the match-level draw is enough for MP.
  if (winnerId && !isDraw) {
    const existing = await db
      .select()
      .from(games)
      .where(eq(games.matchId, match.id))
      .orderBy(games.gameNumber);
    const now = new Date();
    const [roundForEvent] = await db
      .select()
      .from(rounds)
      .where(eq(rounds.id, match.roundId));
    const [eventRow] = await db
      .select()
      .from(events)
      .where(eq(events.id, roundForEvent.eventId));
    const startingLife = eventRow?.startingLife ?? 20;
    if (existing.length === 0) {
      await db.insert(games).values([
        {
          matchId: match.id,
          gameNumber: 1,
          playerALife: startingLife,
          playerBLife: startingLife,
          winnerId,
          completedAt: now,
        },
        {
          matchId: match.id,
          gameNumber: 2,
          playerALife: startingLife,
          playerBLife: startingLife,
          winnerId,
          completedAt: now,
        },
      ]);
    } else {
      // Update the in-progress game and add a second decisive game.
      const g1 = existing[0];
      await db
        .update(games)
        .set({ winnerId, completedAt: now })
        .where(eq(games.id, g1.id));
      if (existing.length === 1) {
        await db.insert(games).values({
          matchId: match.id,
          gameNumber: 2,
          playerALife: startingLife,
          playerBLife: startingLife,
          winnerId,
          completedAt: now,
        });
      }
    }
  }

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, match.roundId));

  // ELO only applies to decisive results — draws hold ratings constant for
  // simplicity. Real ELO does adjust for draws, but it's a small effect and
  // friends-tournament accuracy doesn't need it.
  if (winnerId && match.playerBId) {
    const [a] = await db
      .select()
      .from(players)
      .where(eq(players.id, match.playerAId));
    const [b] = await db
      .select()
      .from(players)
      .where(eq(players.id, match.playerBId));
    const elo = computeMatchElo({
      playerAId: a.id,
      playerARating: a.currentElo,
      playerBId: b.id,
      playerBRating: b.currentElo,
      winnerId,
    });
    await db.insert(eloChanges).values([
      {
        matchId: match.id,
        playerId: a.id,
        before: elo.playerA.before,
        after: elo.playerA.after,
        delta: elo.playerA.delta,
      },
      {
        matchId: match.id,
        playerId: b.id,
        before: elo.playerB.before,
        after: elo.playerB.after,
        delta: elo.playerB.delta,
      },
    ]);
    await db
      .update(players)
      .set({ currentElo: elo.playerA.after })
      .where(eq(players.id, a.id));
    await db
      .update(players)
      .set({ currentElo: elo.playerB.after })
      .where(eq(players.id, b.id));
  }

  publish(round.eventId, {
    type: "match_complete",
    matchId: match.id,
    winnerId: winnerId ?? "",
  });

  revalidatePath(`/events/${round.eventId}/manage`);
  revalidatePath(`/events/${round.eventId}/broadcast`);
  revalidatePath(`/events/${round.eventId}/play`);
}

/**
 * Claim a player identity for an event by tapping a wizard portrait on
 * `/events/[id]/claim`. Sets both the per-event cookie (used by /play and the
 * realtime views) and the league cookie (durable identity across events in
 * the same league). Last-claim-wins by design.
 */
export async function claimIdentityAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  if (!eventId) throw new Error("eventId required");
  if (!playerId) throw new Error("playerId required");

  const [ep] = await db
    .select()
    .from(eventPlayers)
    .where(
      and(
        eq(eventPlayers.eventId, eventId),
        eq(eventPlayers.playerId, playerId)
      )
    )
    .limit(1);
  if (!ep) throw new Error("Player is not on this event's roster");

  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));

  await setPlayerCookie(eventId, ep.joinToken);
  if (player) {
    await setLeagueCookie(player.leagueId, player.leagueToken);
  }
  redirect(`/events/${eventId}/play`);
}
