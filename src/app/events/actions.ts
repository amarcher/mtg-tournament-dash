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
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  datePolls,
  eloChanges,
  gameNights,
  nightRsvps,
  eventPlayers,
  events,
  games,
  matches,
  players,
  pollOptions,
  pollVotes,
  rounds,
} from "@/db/schema";
import {
  getCurrentRound,
  getDatePoll,
  getEventBySourceNight,
  getEventBySourcePoll,
  getGameNight,
  getEventStandings,
  getPairingInputs,
  getRoundMatches,
  listOpenEventsForPlayer,
} from "@/db/queries";
import { generateSwissPairings } from "@/lib/pairings/swiss";
import { computeMatchElo } from "@/lib/elo";
import { leagues } from "@/db/schema";
import {
  generateJoinToken,
  getCurrentLeaguePlayer,
  getCurrentPlayer,
  setLeagueCookie,
  setPlayerCookie,
} from "@/lib/auth";
import {
  clearOrganizerCookies,
  getSessionUser,
  requireOrganizer,
  requireOrganizerForEvent,
  requireOrganizerForMatch,
  requireOrganizerForRound,
  setOrganizerCookie,
} from "@/lib/authz";
import { leagueMembers } from "@/db/schema";
import {
  addPlayerToEventRoster,
  removePlayerFromEventRoster,
} from "@/lib/event-roster";
import { publish } from "@/lib/pubsub";
import { checkWizardizeLimit } from "@/lib/rate-limit";
import { isMatchParticipant } from "@/lib/match-authz";
import { applyGameWinner, applyLifeAdjust } from "@/lib/match-mutations";
import {
  createBonusGame,
  endBonusGame,
  getBonusGameCallerId,
  joinBonusGame,
  startAnotherBonusGame,
} from "@/lib/bonus-game";
import type { Round } from "@/db/schema";
import {
  applyPortraitToPlayer,
  deletePortraitForPlayer,
  startWizardGeneration,
} from "@/lib/wizard-job";
import { fetchStoredSelfie } from "@/lib/wizard";
import {
  DEFAULT_PORTRAIT_THEME,
  archetypeForTheme,
  isPortraitTheme,
} from "@/lib/wizard-types";
import {
  formatPollDate,
  isPollResponse,
  parseDateTimeLocal,
} from "@/lib/schedule-types";
import { MAX_SERIES_COUNT } from "@/lib/recurrence";

export async function createEventAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const totalRounds = Number(formData.get("totalRounds") ?? 3);
  const startingLife = Number(formData.get("startingLife") ?? 20);
  const setName = String(formData.get("setName") ?? "").trim();
  const playerIds = formData.getAll("playerId").map(String).filter(Boolean);

  if (!leagueId) throw new Error("League required");
  if (!name) throw new Error("Event name required");
  if (playerIds.length < 2) throw new Error("Need at least 2 players");
  await requireOrganizer(leagueId);

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
    .values({
      leagueId,
      name,
      totalRounds,
      startingLife,
      setName: setName || null,
    })
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
  await requireOrganizer(leagueId);
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
 * Organizer roster amendment: put an existing league wizard on the event's
 * roster. Works on draft AND active events (a late arrival slots into the
 * next round's pairings); re-adding a dropped player reinstates them.
 */
export async function addExistingPlayerToEventAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const playerId = String(formData.get("playerId") ?? "").trim();
  if (!eventId) throw new Error("eventId required");
  if (!playerId) throw new Error("playerId required");
  await requireOrganizerForEvent(eventId);
  await addPlayerToEventRoster({ eventId, playerId, organizerOverride: true });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/claim`);
  revalidatePath(`/events/${eventId}/broadcast`);
  revalidatePath(`/events/${eventId}/play`);
}

/**
 * Organizer roster amendment: take a player off the event. Draft events
 * delete the seat; active events drop the player — completed results stand,
 * future pairings skip them, unfinished matches become byes for the
 * opponent. See removePlayerFromEventRoster for the full semantics.
 */
export async function removeEventPlayerAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const playerId = String(formData.get("playerId") ?? "").trim();
  if (!eventId) throw new Error("eventId required");
  if (!playerId) throw new Error("playerId required");
  await requireOrganizerForEvent(eventId);
  await removePlayerFromEventRoster({ eventId, playerId });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/claim`);
  revalidatePath(`/events/${eventId}/broadcast`);
  revalidatePath(`/events/${eventId}/play`);
}

/**
 * Self-service identity creation from the league claim page. Creates a player
 * in the league, sets the league cookie, and redirects to wizardize (or the
 * league home if the caller asks).
 */
export async function createLeaguePlayerAction(formData: FormData) {
  const leagueSlug = String(formData.get("leagueSlug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const next = safeNextPath(formData);
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

  // Walk-up chain: when creation was reached from an event's claim page (the
  // TV QR), grab a seat in that event too — if it's still in draft — so the
  // new wizard is already rostered by the time they finish their portrait.
  // Best-effort: a started event just skips this, never blocks onboarding.
  if (eventId) {
    try {
      const { joinToken } = await addPlayerToEventRoster({
        eventId,
        playerId: player.id,
      });
      await setPlayerCookie(eventId, joinToken);
      revalidatePath(`/events/${eventId}/claim`);
      revalidatePath(`/events/${eventId}/manage`);
    } catch {
      /* event started or invalid — onboarding continues without the seat */
    }
  }

  redirect(next ?? `/players/${player.id}`);
}

/**
 * In-app relative path to return to after a claim (e.g. the bonus-game page
 * whose QR sent an unrecognized phone through claim first). Anything that
 * isn't a same-origin absolute path is discarded.
 */
function safeNextPath(formData: FormData): string | null {
  const next = String(formData.get("next") ?? "").trim();
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/**
 * Walk-up self-join from the event claim page: a player recognized by their
 * league cookie (but not on this event's roster) grabs a seat themselves
 * while the event is still in draft. The playerId is always the caller's own
 * identity — never form-supplied.
 */
export async function joinEventAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) throw new Error("eventId required");

  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("Event not found");

  const caller = await getCurrentLeaguePlayer(event.leagueId);
  if (!caller) {
    throw new Error("Claim your wizard in this league first, then join.");
  }

  const { joinToken } = await addPlayerToEventRoster({
    eventId,
    playerId: caller.id,
  });
  await setPlayerCookie(eventId, joinToken);
  revalidatePath(`/events/${eventId}/claim`);
  revalidatePath(`/events/${eventId}/manage`);
  redirect(`/events/${eventId}/play`);
}

/**
 * Tap an existing wizard card on the league claim page to claim that identity.
 * Sets the league cookie so subsequent visits in this league recognize the
 * player automatically.
 */
export async function claimLeaguePlayerAction(formData: FormData) {
  const leagueSlug = String(formData.get("leagueSlug") ?? "").trim();
  const playerId = String(formData.get("playerId") ?? "").trim();
  const next = safeNextPath(formData);
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

  // An explicit return target (e.g. a bonus-game QR that routed through
  // claim) wins over the open-event convenience redirect below.
  if (next) redirect(next);

  // If this wizard has a seat in an open event, continue straight into it —
  // set the event cookie and land on the scorekeeper instead of dumping the
  // player at league home to hunt for the "Scorekeeper" card. Prefer an
  // active event over a draft one.
  const open = await listOpenEventsForPlayer(league.id, player.id);
  const target =
    open.find((o) => o.event.status === "active") ?? open[0] ?? null;
  if (target) {
    const [ep] = await db
      .select()
      .from(eventPlayers)
      .where(
        and(
          eq(eventPlayers.eventId, target.event.id),
          eq(eventPlayers.playerId, player.id)
        )
      )
      .limit(1);
    if (ep) {
      await setPlayerCookie(target.event.id, ep.joinToken);
      redirect(`/events/${target.event.id}/play`);
    }
  }

  redirect(`/leagues/${league.slug}`);
}

export async function generateWizardAction(formData: FormData) {
  const playerId = String(formData.get("playerId") ?? "");
  const themeRaw = String(formData.get("theme") ?? "");
  const archetypeRaw = String(formData.get("archetype") ?? "");
  const freeform = String(formData.get("freeform") ?? "");
  const selfie = formData.get("selfie");
  const useSavedSelfie = String(formData.get("useSavedSelfie") ?? "") === "1";

  if (!playerId) throw new Error("playerId required");
  const uploaded = selfie instanceof File && selfie.size > 0 ? selfie : null;
  if (uploaded && uploaded.size > 12 * 1024 * 1024)
    throw new Error("Selfie too large (max 12 MB)");
  if (!uploaded && !useSavedSelfie)
    throw new Error("Select a selfie file first.");

  const theme = isPortraitTheme(themeRaw) ? themeRaw : DEFAULT_PORTRAIT_THEME;
  const archetype = archetypeForTheme(theme, archetypeRaw);

  // Only the wizard's owner may regenerate their portrait — the very first
  // step blanks the existing avatar tiers, so an unauthenticated POST could
  // wipe someone's portrait. The identity bar is the league cookie set by the
  // claim flows; anyone else gets pointed there by the page UI.
  const [target] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));
  if (!target) throw new Error("Player not found");
  const caller = await getCurrentLeaguePlayer(target.leagueId);
  if (!caller || caller.id !== target.id) {
    throw new Error(
      `Only ${target.displayName} can edit this portrait. Claim this wizard from the league page first.`
    );
  }

  await checkWizardizeLimit(target.id, target.leagueId);

  // Reuse beats re-upload: the normalized seed selfie from the last
  // generation is already stored, so a regen only needs a fresh file when
  // the player wants a different photo.
  let selfieFile: File;
  if (uploaded) {
    selfieFile = uploaded;
  } else if (target.selfieUrl) {
    selfieFile = await fetchStoredSelfie(target.selfieUrl);
  } else {
    throw new Error(
      "No saved selfie yet — select a selfie file to generate your first portrait."
    );
  }

  await startWizardGeneration({
    playerId,
    theme,
    archetype,
    freeform,
    selfie: selfieFile,
  });

  revalidatePath(`/players/${playerId}`);
}

/** Re-apply one of the player's cataloged portrait sets as their avatar. */
export async function applyPortraitAction(formData: FormData) {
  const playerId = String(formData.get("playerId") ?? "");
  const portraitId = String(formData.get("portraitId") ?? "");
  if (!playerId) throw new Error("playerId required");
  if (!portraitId) throw new Error("portraitId required");

  const [target] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));
  if (!target) throw new Error("Player not found");
  const caller = await getCurrentLeaguePlayer(target.leagueId);
  if (!caller || caller.id !== target.id) {
    throw new Error(
      `Only ${target.displayName} can change this portrait. Claim this wizard from the league page first.`
    );
  }
  // An in-flight generation will overwrite whatever gets applied here — and a
  // non-null avatarUrl used to hide the row from the stale-job sweeper.
  // Refuse instead of racing the background job.
  if (target.wizardJobStartedAt) {
    throw new Error(
      "A portrait is being generated right now — wait for it to finish before switching."
    );
  }

  await applyPortraitToPlayer(playerId, portraitId);
  revalidatePath(`/players/${playerId}`);
}

/** Delete one of the player's cataloged portrait sets (never the active one). */
export async function deletePortraitAction(formData: FormData) {
  const playerId = String(formData.get("playerId") ?? "");
  const portraitId = String(formData.get("portraitId") ?? "");
  if (!playerId) throw new Error("playerId required");
  if (!portraitId) throw new Error("portraitId required");

  const [target] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));
  if (!target) throw new Error("Player not found");
  const caller = await getCurrentLeaguePlayer(target.leagueId);
  if (!caller || caller.id !== target.id) {
    throw new Error(
      `Only ${target.displayName} can edit this wardrobe. Claim this wizard from the league page first.`
    );
  }
  if (target.wizardJobStartedAt) {
    throw new Error(
      "A portrait is being generated right now — wait for it to finish first."
    );
  }

  await deletePortraitForPlayer(playerId, portraitId);
  revalidatePath(`/players/${playerId}`);
}

/**
 * Stage the next round's pairings without making them visible to players.
 *
 * Inserts a round with status='pending' plus a set of pending matches that the
 * organizer can revise on the manage page (swap players, drop pairs that don't
 * want to play, re-roll, add manual pairings). Players don't see anything
 * until `confirmRoundAction` flips the pending round → active.
 *
 * Idempotent at the pending-round level: if a pending round already exists,
 * returns its id without regenerating pairings. Use
 * `regeneratePendingPairingsAction` to refresh.
 */
export async function previewNextRoundAction(eventId: string) {
  const event = await requireOrganizerForEvent(eventId);
  if (event.status === "complete") throw new Error("Event is already complete");

  const existingRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.eventId, eventId));

  const pending = existingRounds.find((r) => r.status === "pending");
  if (pending) return { roundId: pending.id, alreadyPending: true };

  const completedOrActiveCount = existingRounds.filter(
    (r) => r.status === "complete" || r.status === "active"
  ).length;
  if (completedOrActiveCount >= event.totalRounds) {
    throw new Error("All rounds have been played");
  }

  const pairings = generateSwissPairings(await getPairingInputs(eventId));

  const roundNumber = completedOrActiveCount + 1;
  const [newRound] = await db
    .insert(rounds)
    .values({
      eventId,
      roundNumber,
      status: "pending",
    })
    .returning();

  await db.insert(matches).values(
    pairings.map((p) => ({
      roundId: newRound.id,
      tableNumber: p.tableNumber,
      playerAId: p.playerAId,
      playerBId: p.playerBId,
      status: "pending" as const,
    }))
  );

  revalidatePath(`/events/${eventId}/manage`);
  return { roundId: newRound.id, alreadyPending: false };
}

/**
 * Commit a pending round: mark previous active rounds complete (leaving any
 * in_progress matches alone, so excused pairs keep playing through the
 * transition), then flip pending → active, write game 1 rows for real matches,
 * auto-resolve byes, and publish `round_started` so every phone advances.
 */
export async function confirmRoundAction(eventId: string) {
  const event = await requireOrganizerForEvent(eventId);
  if (event.status === "complete") throw new Error("Event is already complete");

  const [pending] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.eventId, eventId), eq(rounds.status, "pending")));
  if (!pending) throw new Error("No pending round to confirm");

  const pendingMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.roundId, pending.id));
  if (pendingMatches.length === 0)
    throw new Error("Pending round has no matches — drop the round or pair players first");

  // Soft-close any still-active rounds: their fully-resolved matches stay
  // complete; any match still flagged in_progress remains so on purpose (the
  // pair was excused and is still playing). The round row going `complete`
  // is what lets standings move on and lets the new round be the canonical
  // "active" one for `getCurrentRound`.
  const stillActive = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.eventId, eventId), eq(rounds.status, "active")));
  for (const r of stillActive) {
    await db
      .update(rounds)
      .set({ status: "complete", completedAt: new Date() })
      .where(eq(rounds.id, r.id));
  }

  // Resolve byes and flip in-progress on real matches as a single sweep.
  const realMatches = pendingMatches.filter((m) => m.playerBId !== null);
  const byes = pendingMatches.filter((m) => m.playerBId === null);

  for (const bye of byes) {
    await db
      .update(matches)
      .set({
        status: "complete",
        winnerId: bye.playerAId,
        completedAt: new Date(),
      })
      .where(eq(matches.id, bye.id));
  }

  for (const m of realMatches) {
    await db
      .update(matches)
      .set({ status: "in_progress" })
      .where(eq(matches.id, m.id));
  }

  await db
    .update(rounds)
    .set({ status: "active", startedAt: new Date() })
    .where(eq(rounds.id, pending.id));

  if (event.status === "draft") {
    await db
      .update(events)
      .set({ status: "active" })
      .where(eq(events.id, eventId));
  }

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

  await publish(eventId, {
    type: "round_started",
    roundNumber: pending.roundNumber,
  });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/broadcast`);
  revalidatePath(`/events/${eventId}/play`);
}

/**
 * Old single-shot helper — preview + immediately confirm. Kept for the verify
 * harness and any caller that doesn't want to step through the review UI.
 */
export async function startNextRoundAction(eventId: string) {
  await requireOrganizerForEvent(eventId);
  await previewNextRoundAction(eventId);
  await confirmRoundAction(eventId);
}

/**
 * Throw out the current pending pairings and re-roll them via Swiss. Useful
 * when the organizer doesn't like the auto result and wants another draw.
 */
export async function regeneratePendingPairingsAction(eventId: string) {
  await requireOrganizerForEvent(eventId);
  const [pending] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.eventId, eventId), eq(rounds.status, "pending")));
  if (!pending) throw new Error("No pending round to regenerate");

  await db.delete(matches).where(eq(matches.roundId, pending.id));

  const pairings = generateSwissPairings(await getPairingInputs(eventId));
  await db.insert(matches).values(
    pairings.map((p) => ({
      roundId: pending.id,
      tableNumber: p.tableNumber,
      playerAId: p.playerAId,
      playerBId: p.playerBId,
      status: "pending" as const,
    }))
  );
  revalidatePath(`/events/${eventId}/manage`);
}

/**
 * Swap two players between two pending matches (or within the same pending
 * match — useful for flipping who's A vs B). Only works on pending rounds; an
 * active or completed match isn't editable through this path.
 */
export async function swapMatchPlayersAction(args: {
  matchAId: string;
  sideA: "a" | "b";
  matchBId: string;
  sideB: "a" | "b";
}) {
  const [mA] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, args.matchAId));
  const [mB] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, args.matchBId));
  if (!mA || !mB) throw new Error("Match not found");
  if (mA.status !== "pending" || mB.status !== "pending")
    throw new Error("Can only revise pending pairings");
  if (mA.roundId !== mB.roundId)
    throw new Error("Matches must be in the same round");
  const swapRound = await requireOrganizerForRound(mA.roundId);

  const aHas = args.sideA === "a" ? mA.playerAId : mA.playerBId;
  const bHas = args.sideB === "a" ? mB.playerAId : mB.playerBId;
  if (aHas === null || bHas === null)
    throw new Error("Cannot swap an empty bye slot");

  await db
    .update(matches)
    .set(args.sideA === "a" ? { playerAId: bHas } : { playerBId: bHas })
    .where(eq(matches.id, mA.id));
  await db
    .update(matches)
    .set(args.sideB === "a" ? { playerAId: aHas } : { playerBId: aHas })
    .where(eq(matches.id, mB.id));

  revalidatePath(`/events/${swapRound.eventId}/manage`);
}

/**
 * Excuse a pair from the upcoming round by deleting their pending match. The
 * two players will have no scheduled match this round; if either of them is
 * still in an in_progress match from the previous round, they keep playing it
 * on their phones (see `getActiveMatchForPlayer` for the lookup rule).
 */
export async function dropPendingMatchAction(args: { matchId: string }) {
  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, args.matchId));
  if (!m) throw new Error("Match not found");
  if (m.status !== "pending")
    throw new Error("Can only drop pending pairings");
  const round = await requireOrganizerForRound(m.roundId);

  await db.delete(matches).where(eq(matches.id, m.id));

  revalidatePath(`/events/${round.eventId}/manage`);
}

/**
 * Manually create a new pairing in the pending round. Both players must be on
 * the event roster; neither can already be in another pending match in this
 * round (otherwise standings double-count and standings views collapse).
 */
export async function addManualPairingAction(args: {
  roundId: string;
  playerAId: string;
  playerBId: string | null;
}) {
  if (args.playerAId === args.playerBId)
    throw new Error("Player can't be paired with themselves");

  const round = await requireOrganizerForRound(args.roundId);
  if (round.status !== "pending")
    throw new Error("Can only edit pending rounds");

  const roster = await db
    .select()
    .from(eventPlayers)
    .where(eq(eventPlayers.eventId, round.eventId));
  const rosterIds = new Set(roster.map((r) => r.playerId));
  if (!rosterIds.has(args.playerAId))
    throw new Error("Player A is not on the event roster");
  if (args.playerBId && !rosterIds.has(args.playerBId))
    throw new Error("Player B is not on the event roster");

  const existing = await db
    .select()
    .from(matches)
    .where(eq(matches.roundId, round.id));
  const inUse = new Set<string>();
  for (const m of existing) {
    inUse.add(m.playerAId);
    if (m.playerBId) inUse.add(m.playerBId);
  }
  if (inUse.has(args.playerAId))
    throw new Error("Player A is already paired this round");
  if (args.playerBId && inUse.has(args.playerBId))
    throw new Error("Player B is already paired this round");

  const nextTable =
    Math.max(0, ...existing.map((m) => m.tableNumber)) + 1;
  await db.insert(matches).values({
    roundId: round.id,
    tableNumber: nextTable,
    playerAId: args.playerAId,
    playerBId: args.playerBId,
    status: "pending",
  });

  revalidatePath(`/events/${round.eventId}/manage`);
}

/**
 * Tear down the whole pending round. Useful when the organizer wants to roll
 * back the "preview next round" step entirely.
 */
/**
 * Undo a just-confirmed round: flip the round and its matches back to
 * pending so the organizer lands on the review-pairings screen (swap / drop /
 * manual pairing) and can confirm again. The escape hatch for "we confirmed
 * the wrong pairings and everyone already sat down".
 *
 * Refuses once any result is recorded — reverting would silently discard it.
 * Life taps alone don't block (game rows are recreated at the next confirm)
 * but they are discarded, which the UI copy says out loud.
 */
export async function revertRoundToPairingsAction(eventId: string) {
  await requireOrganizerForEvent(eventId);
  const [alreadyPending] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.eventId, eventId), eq(rounds.status, "pending")));
  if (alreadyPending) {
    throw new Error(
      `Cancel the round ${alreadyPending.roundNumber} preview first`
    );
  }

  const round = await getCurrentRound(eventId);
  if (!round) throw new Error("No active round to revert");

  const ms = await db
    .select()
    .from(matches)
    .where(eq(matches.roundId, round.id));
  const matchIds = ms.map((m) => m.id);
  const roundGames = matchIds.length
    ? await db.select().from(games).where(inArray(games.matchId, matchIds))
    : [];
  const hasResults =
    ms.some(
      (m) => m.playerBId !== null && (m.status === "complete" || m.isDraw)
    ) || roundGames.some((g) => g.winnerId !== null);
  if (hasResults) {
    throw new Error(
      "Results are already in for this round — swap individual pairings instead of reverting"
    );
  }

  if (matchIds.length) {
    await db.delete(games).where(inArray(games.matchId, matchIds));
  }
  // Byes were auto-resolved at confirm; clear those wins back to pending too.
  await db
    .update(matches)
    .set({ status: "pending", winnerId: null, isDraw: false, completedAt: null })
    .where(eq(matches.roundId, round.id));
  await db
    .update(rounds)
    .set({ status: "pending", startedAt: null })
    .where(eq(rounds.id, round.id));

  // Reverting round 1 of a fresh event reopens the draft window (walk-up
  // self-join is draft-only), mirroring confirmRoundAction's draft→active.
  const allRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.eventId, eventId));
  const anyPlayed = allRounds.some(
    (r) => r.id !== round.id && (r.status === "active" || r.status === "complete")
  );
  if (!anyPlayed) {
    await db.update(events).set({ status: "draft" }).where(eq(events.id, eventId));
  }

  // Structural event so every phone reloads off the retracted round and into
  // the waiting room.
  await publish(eventId, {
    type: "round_completed",
    roundNumber: round.roundNumber,
  });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/broadcast`);
  revalidatePath(`/events/${eventId}/play`);
}

/**
 * Swap two players between matches of a round that is already running — the
 * "wrong people sat down together" fix, without retracting the whole round.
 * Only legal while neither table has a recorded result; both tables' game-1
 * life resets to the event's starting life since different players now hold
 * the seats. Byes are excluded (they were auto-resolved at confirm) — revert
 * the round for those.
 */
export async function swapActiveMatchPlayersAction(args: {
  matchAId: string;
  sideA: "a" | "b";
  matchBId: string;
  sideB: "a" | "b";
}) {
  const [mA] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, args.matchAId));
  const [mB] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, args.matchBId));
  if (!mA || !mB) throw new Error("Match not found");
  if (mA.roundId !== mB.roundId)
    throw new Error("Matches must be in the same round");
  const round = await requireOrganizerForRound(mA.roundId);
  if (mA.status !== "in_progress" || mB.status !== "in_progress")
    throw new Error("Both matches must still be in progress");
  if (mA.playerBId === null || mB.playerBId === null)
    throw new Error("Can't swap into a bye — revert the round instead");

  const matchIds = [...new Set([mA.id, mB.id])];
  const roundGames = await db
    .select()
    .from(games)
    .where(inArray(games.matchId, matchIds));
  if (roundGames.some((g) => g.winnerId !== null)) {
    throw new Error(
      "A game result is already recorded on one of these tables"
    );
  }

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, round.eventId));

  const aHas = args.sideA === "a" ? mA.playerAId : mA.playerBId;
  const bHas = args.sideB === "a" ? mB.playerAId : mB.playerBId;
  await db
    .update(matches)
    .set(args.sideA === "a" ? { playerAId: bHas } : { playerBId: bHas })
    .where(eq(matches.id, mA.id));
  await db
    .update(matches)
    .set(args.sideB === "a" ? { playerAId: aHas } : { playerBId: aHas })
    .where(eq(matches.id, mB.id));

  // New seats, fresh life. Discards any stray taps on either table.
  await db
    .update(games)
    .set({
      playerALife: event.startingLife,
      playerBLife: event.startingLife,
    })
    .where(inArray(games.matchId, matchIds));

  // Same broadcast as a round start: every phone reloads and re-resolves
  // which match is theirs.
  await publish(event.id, {
    type: "round_started",
    roundNumber: round.roundNumber,
  });
  revalidatePath(`/events/${event.id}/manage`);
  revalidatePath(`/events/${event.id}/broadcast`);
  revalidatePath(`/events/${event.id}/play`);
}

export async function cancelPendingRoundAction(eventId: string) {
  await requireOrganizerForEvent(eventId);
  const [pending] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.eventId, eventId), eq(rounds.status, "pending")));
  if (!pending) return;
  await db.delete(matches).where(eq(matches.roundId, pending.id));
  await db.delete(rounds).where(eq(rounds.id, pending.id));
  revalidatePath(`/events/${eventId}/manage`);
}

export async function completeRoundAction(eventId: string) {
  const event = await requireOrganizerForEvent(eventId);
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

  const completed = (
    await db.select().from(rounds).where(eq(rounds.eventId, eventId))
  ).filter((r) => r.status === "complete").length;

  if (completed >= event.totalRounds) {
    await finalizeEvent(eventId);
  }

  await publish(eventId, {
    type: "round_completed",
    roundNumber: round.roundNumber,
  });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/broadcast`);
}

/**
 * Lock in final placements and flip the event to `complete`. Shared by
 * `completeRoundAction` (when the last scheduled round closes) and
 * `endEventAction` (when the organizer stops early). Standings are computed
 * from completed rounds only, so an early end ranks players on the rounds
 * actually played.
 */
async function finalizeEvent(eventId: string) {
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

/**
 * End the tournament before its scheduled round count is reached — the
 * organizer uses this when the group decides to stop early (e.g. ran out of
 * time after two of three rounds). If a round is still active, every match
 * must have a reported winner first so its results count; we close it, then
 * rank players on everything played so far and lock in placements.
 */
export async function endEventAction(eventId: string) {
  const event = await requireOrganizerForEvent(eventId);
  if (event.status === "complete") throw new Error("Event is already complete");

  const round = await getCurrentRound(eventId);
  if (round) {
    const ms = await getRoundMatches(round.id);
    const incomplete = ms.filter((r) => r.match.status !== "complete");
    if (incomplete.length > 0) {
      throw new Error(
        `${incomplete.length} match(es) still in progress — report results before ending the event`
      );
    }
    await db
      .update(rounds)
      .set({ status: "complete", completedAt: new Date() })
      .where(eq(rounds.id, round.id));
  }

  // Drop a previewed-but-unconfirmed round so it doesn't survive the finalize
  // as a stale orphan that reappears (with stale pairings) on reopen.
  const [pending] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.eventId, eventId), eq(rounds.status, "pending")));
  if (pending) {
    await db.delete(matches).where(eq(matches.roundId, pending.id));
    await db.delete(rounds).where(eq(rounds.id, pending.id));
  }

  const completedCount = (
    await db.select().from(rounds).where(eq(rounds.eventId, eventId))
  ).filter((r) => r.status === "complete").length;
  if (completedCount === 0) {
    throw new Error("Play at least one round before ending the event");
  }

  await finalizeEvent(eventId);

  await publish(eventId, { type: "event_state_changed", status: "complete" });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/broadcast`);
  revalidatePath(`/events/${eventId}/play`);
}

/**
 * Undo a completion — clear the locked-in placements and flip the event back to
 * `active` so the organizer can keep playing or re-end. The inverse of
 * `finalizeEvent`. ELO and match results are written at result-report time, not
 * at finalize, so reopening loses nothing; previewing a new round still respects
 * the event's `totalRounds` cap.
 */
export async function reopenEventAction(eventId: string) {
  const event = await requireOrganizerForEvent(eventId);
  if (event.status !== "complete") throw new Error("Event is not complete");

  await db
    .update(eventPlayers)
    .set({ finalStanding: null })
    .where(eq(eventPlayers.eventId, eventId));
  await db
    .update(events)
    .set({ status: "active" })
    .where(eq(events.id, eventId));

  await publish(eventId, { type: "event_state_changed", status: "active" });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/broadcast`);
  revalidatePath(`/events/${eventId}/play`);
}

/**
 * Extend a finished event by one round — raises `totalRounds` and reopens the
 * event so the extra round flows through the normal preview/confirm UI. Used
 * when a group wants to keep playing past the originally scheduled count. The
 * inverse of nothing in particular; just re-end (or reopen) when done. Match
 * results and ELO carry over untouched.
 */
export async function addRoundAction(eventId: string) {
  const event = await requireOrganizerForEvent(eventId);
  if (event.status !== "complete") throw new Error("Event is not complete");

  await db
    .update(eventPlayers)
    .set({ finalStanding: null })
    .where(eq(eventPlayers.eventId, eventId));
  await db
    .update(events)
    .set({ status: "active", totalRounds: event.totalRounds + 1 })
    .where(eq(events.id, eventId));

  await publish(eventId, { type: "event_state_changed", status: "active" });
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/broadcast`);
  revalidatePath(`/events/${eventId}/play`);
}

/* ---- in-match mutations (called from phone view) ---- */

/**
 * Resolve the match + its event and require the cookie-bound caller to be a
 * participant. Mirrors the read route's check; the mutating actions go through
 * this so they aren't less protected than reads.
 */
async function authorizeMatchParticipant(matchId: string) {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId));
  if (!match) throw new Error("Match not found");
  if (!match.roundId) {
    // Bonus game — identity is the durable league cookie, with the event
    // cookie as a fallback for players who only ever joined via a deep link.
    const playerId = await getBonusGameCallerId(match);
    if (!isMatchParticipant(playerId, match.playerAId, match.playerBId))
      throw new Error("Not a participant in this bonus game");
    return { match, round: null };
  }
  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, match.roundId));
  const me = await getCurrentPlayer(round.eventId);
  if (!isMatchParticipant(me?.playerId, match.playerAId, match.playerBId))
    throw new Error("Not a participant in this match");
  return { match, round: round as Round | null };
}

export async function adjustLifeAction(args: {
  matchId: string;
  side: "a" | "b";
  delta: number;
  /** The game the client believed it was acting on. */
  gameId: string;
  /** Life the client displayed for this side before applying its delta. */
  expectedLife: number;
}) {
  await authorizeMatchParticipant(args.matchId);
  return applyLifeAdjust(args);
}

export async function reportGameWinnerAction(args: {
  matchId: string;
  winnerId: string;
  /** The game the client believed it was reporting — see applyGameWinner. */
  gameId: string;
}) {
  const { match, round } = await authorizeMatchParticipant(args.matchId);
  await applyGameWinner(args);
  // Revalidation lives in the action wrapper (not the domain core) so the
  // request-scoped swallowing `revalidatePath` above is used — trusted callers
  // like the verify harness drive `applyGameWinner` directly, outside a request.
  if (round) {
    revalidatePath(`/events/${round.eventId}/play`);
    revalidatePath(`/events/${round.eventId}/broadcast`);
    revalidatePath(`/events/${round.eventId}/manage`);
  } else {
    revalidatePath(`/matches/${match.id}`);
  }
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
  await requireOrganizerForMatch(matchId);
  await finalizeMatchOutcome({ matchId, outcome });
}

/**
 * Organizer undo for a recorded result: put the match back in progress,
 * reverse its ELO deltas, and unwind whatever game rows the finalizer stamped
 * (synthesized 2-0 sweeps are deleted; a real game that was mid-play when the
 * result landed reopens with its life totals intact). Publishes
 * `match_reopened` so both phones leave the result screen and rejoin the game.
 * Available until the event is finalized — reopening a match in an
 * already-closed round works like an excused pair playing through.
 */
export async function clearMatchResultAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  if (!matchId) throw new Error("matchId required");
  const match = await requireOrganizerForMatch(matchId);
  if (match.status !== "complete") throw new Error("Match has no result to clear");
  if (!match.roundId) throw new Error("Bonus games have no result to clear");
  if (match.playerBId === null) throw new Error("Byes can't be reopened");

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, match.roundId));
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, round.eventId));
  if (event.status === "complete")
    throw new Error("Reopen the event before clearing a result");

  const eloRows = await db
    .select()
    .from(eloChanges)
    .where(eq(eloChanges.matchId, match.id));
  // Subtract the recorded delta rather than restoring `before` — later
  // matches may have moved the rating since, and their effect must survive.
  for (const row of eloRows) {
    const [p] = await db
      .select()
      .from(players)
      .where(eq(players.id, row.playerId));
    if (!p) continue;
    await db
      .update(players)
      .set({ currentElo: p.currentElo - row.delta })
      .where(eq(players.id, row.playerId));
  }
  if (eloRows.length > 0) {
    await db.delete(eloChanges).where(eq(eloChanges.matchId, match.id));
  }

  // Games stamped by the finalizer share the completion instant (within one
  // request) and carry the match winner. An untouched-life stamped game is a
  // synthesized sweep row — delete it; one with real life totals was being
  // played when the result landed — reopen it as it stood.
  const completedAtMs = match.completedAt?.getTime() ?? 0;
  const startingLife = event.startingLife;
  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.matchId, match.id))
    .orderBy(games.gameNumber);
  const stamped = allGames.filter(
    (g) =>
      g.winnerId === match.winnerId &&
      g.completedAt !== null &&
      Math.abs(g.completedAt.getTime() - completedAtMs) < 5000
  );
  const deletedIds = new Set<string>();
  let hasOpenGame = allGames.some((g) => g.winnerId === null);
  for (const g of stamped) {
    if (g.playerALife === startingLife && g.playerBLife === startingLife) {
      await db.delete(games).where(eq(games.id, g.id));
      deletedIds.add(g.id);
    } else {
      await db
        .update(games)
        .set({ winnerId: null, completedAt: null })
        .where(eq(games.id, g.id));
      hasOpenGame = true;
    }
  }
  if (!hasOpenGame) {
    const surviving = allGames.filter((g) => !deletedIds.has(g.id));
    const nextGameNumber =
      surviving.reduce((n, g) => Math.max(n, g.gameNumber), 0) + 1;
    await db.insert(games).values({
      matchId: match.id,
      gameNumber: nextGameNumber,
      playerALife: startingLife,
      playerBLife: startingLife,
    });
  }

  await db
    .update(matches)
    .set({ status: "in_progress", winnerId: null, isDraw: false, completedAt: null })
    .where(eq(matches.id, match.id));

  await publish(round.eventId, { type: "match_reopened", matchId: match.id });
  revalidatePath(`/events/${round.eventId}/manage`);
  revalidatePath(`/events/${round.eventId}/broadcast`);
  revalidatePath(`/events/${round.eventId}/play`);
}

/**
 * Programmatic version of the above for the phone view's "Match draw" button.
 * Kept as a separate export so PlayClient can call it without building a
 * FormData payload.
 */
export async function reportMatchDrawAction(args: { matchId: string }) {
  const { round } = await authorizeMatchParticipant(args.matchId);
  if (!round)
    throw new Error("Bonus games don't have draws — end the game instead");
  await finalizeMatchOutcome({ matchId: args.matchId, outcome: "draw" });
}

/* ---- bonus games (casual head-to-head, player self-service) ---- */

export type BonusGameFormState = { error: string | null };

/**
 * useActionState-shaped: expected failures ("X is already in a bonus game",
 * "claim your wizard first") come back as `{ error }` for the form to render
 * inline. On the Aug 31 draft night these throws hit Next's bare production
 * error screen and read as a dead 404 — never again.
 */
export async function createBonusGameAction(
  _prev: BonusGameFormState,
  formData: FormData
): Promise<BonusGameFormState> {
  const leagueSlug = String(formData.get("leagueSlug") ?? "").trim();
  const rawEventId = String(formData.get("eventId") ?? "").trim();
  const opponentId = String(formData.get("opponentId") ?? "").trim();
  const startingLife = Number(formData.get("startingLife") ?? 20);
  if (!leagueSlug) return { error: "League required" };

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.slug, leagueSlug));
  if (!league) return { error: "League not found" };

  let caller = await getCurrentLeaguePlayer(league.id);
  if (!caller && rawEventId) {
    // Deep-link-only device: the event cookie still proves who this is.
    const ep = await getCurrentPlayer(rawEventId);
    if (ep) {
      const [p] = await db
        .select()
        .from(players)
        .where(eq(players.id, ep.playerId));
      if (p && p.leagueId === league.id) caller = p;
    }
  }
  if (!caller) return { error: "Claim your wizard in this league first" };

  let eventId: string | null = null;
  if (rawEventId) {
    const [ev] = await db
      .select()
      .from(events)
      .where(eq(events.id, rawEventId));
    if (ev && ev.leagueId === league.id) eventId = ev.id;
  }

  let match;
  try {
    match = await createBonusGame({
      leagueId: league.id,
      playerAId: caller.id,
      playerBId: opponentId || null,
      eventId,
      startingLife,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't start the game" };
  }
  redirect(`/matches/${match.id}`);
}

export async function joinBonusGameAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "").trim();
  if (!matchId) throw new Error("matchId required");

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId));
  if (!match || match.roundId) throw new Error("Bonus game not found");

  const callerId = await getBonusGameCallerId(match);
  if (!callerId)
    throw new Error("Claim your wizard in this league first");

  await joinBonusGame({ matchId, playerBId: callerId });
  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}`);
}

export async function endBonusGameAction(args: { matchId: string }) {
  const { round } = await authorizeMatchParticipant(args.matchId);
  if (round) throw new Error("Not a bonus game");
  await endBonusGame({ matchId: args.matchId });
  revalidatePath(`/matches/${args.matchId}`);
}

export async function startAnotherBonusGameAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "").trim();
  if (!matchId) throw new Error("matchId required");
  const { match, round } = await authorizeMatchParticipant(matchId);
  if (round) throw new Error("Not a bonus game");
  if (match.status !== "complete")
    throw new Error("This bonus game is still going");
  const next = await startAnotherBonusGame({ matchId: match.id });
  redirect(`/matches/${next.id}`);
}

async function finalizeMatchOutcome(args: {
  matchId: string;
  outcome: string;
}) {
  const { matchId, outcome } = args;
  if (!matchId) throw new Error("matchId required");
  if (outcome !== "a" && outcome !== "b" && outcome !== "draw") {
    throw new Error("Invalid outcome");
  }

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) throw new Error("Match not found");
  if (!match.roundId)
    throw new Error("Bonus games have no match result to finalize");
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

  await publish(round.eventId, {
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

async function requirePollLeague(leagueId: string) {
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, leagueId));
  if (!league) throw new Error("League not found");
  return league;
}

async function requireLeaguePlayer(leagueId: string, playerId: string) {
  if (!playerId) throw new Error("Claim a wizard first");
  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId));
  if (!player || player.leagueId !== leagueId) {
    throw new Error("Player not in this league");
  }
  return player;
}

export async function createDatePollAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const createdByPlayerId = String(formData.get("playerId") ?? "");
  const title =
    String(formData.get("title") ?? "").trim() || "Next draft night";
  const rawDates = formData
    .getAll("optionDate")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!leagueId) throw new Error("League required");
  const league = await requirePollLeague(leagueId);
  await requireLeaguePlayer(leagueId, createdByPlayerId);

  const dates: Date[] = [];
  for (const raw of rawDates) {
    const parsed = parseDateTimeLocal(raw);
    if (!parsed) throw new Error(`Couldn't read date "${raw}"`);
    if (!dates.some((d) => d.getTime() === parsed.getTime())) {
      dates.push(parsed);
    }
  }
  if (dates.length < 2) {
    throw new Error("Propose at least 2 different dates");
  }

  const [poll] = await db
    .insert(datePolls)
    .values({ leagueId, title, createdByPlayerId })
    .returning();
  await db
    .insert(pollOptions)
    .values(dates.map((startsAt) => ({ pollId: poll.id, startsAt })));

  revalidatePath(`/leagues/${league.slug}`);
  revalidatePath(`/leagues/${league.slug}/schedule`);
  redirect(`/leagues/${league.slug}/schedule/${poll.id}`);
}

export async function castPollVotesAction(formData: FormData) {
  const pollId = String(formData.get("pollId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");

  if (!pollId) throw new Error("Poll required");
  const poll = await getDatePoll(pollId);
  if (!poll) throw new Error("Poll not found");
  if (poll.status !== "open") throw new Error("This poll is closed");
  await requireLeaguePlayer(poll.leagueId, playerId);

  const options = await db
    .select()
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId));
  const rows = options.flatMap((o) => {
    const response = formData.get(`response_${o.id}`);
    return isPollResponse(response)
      ? [{ optionId: o.id, playerId, response }]
      : [];
  });
  if (rows.length === 0) {
    throw new Error("Mark your availability for at least one date");
  }

  await db
    .insert(pollVotes)
    .values(rows)
    .onConflictDoUpdate({
      target: [pollVotes.optionId, pollVotes.playerId],
      set: { response: sql`excluded.response`, updatedAt: sql`now()` },
    });

  const league = await requirePollLeague(poll.leagueId);
  revalidatePath(`/leagues/${league.slug}`);
  revalidatePath(`/leagues/${league.slug}/schedule`);
  revalidatePath(`/leagues/${league.slug}/schedule/${pollId}`);
}

export async function finalizeDatePollAction(formData: FormData) {
  const pollId = String(formData.get("pollId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");

  if (!pollId) throw new Error("Poll required");
  if (!optionId) throw new Error("Pick a date to finalize");
  const poll = await getDatePoll(pollId);
  if (!poll) throw new Error("Poll not found");
  if (poll.status !== "open") throw new Error("This poll is already closed");
  await requireLeaguePlayer(poll.leagueId, playerId);

  const [option] = await db
    .select()
    .from(pollOptions)
    .where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, pollId)));
  if (!option) throw new Error("Date not found in this poll");

  await db
    .update(datePolls)
    .set({ status: "finalized", finalizedOptionId: optionId })
    .where(eq(datePolls.id, pollId));

  const league = await requirePollLeague(poll.leagueId);
  revalidatePath(`/leagues/${league.slug}`);
  revalidatePath(`/leagues/${league.slug}/schedule`);
  revalidatePath(`/leagues/${league.slug}/schedule/${pollId}`);
}

/**
 * Turn a date poll into a real event. Uses the finalized date (finalizing the
 * poll first if the organizer picked a date on an open poll), pre-rosters
 * everyone who answered yes / if-need-be for that date, and stamps the event
 * with the poll's date + a back-link. Idempotent: a poll that already spawned
 * an event just redirects to it.
 */
export async function promoteDatePollAction(formData: FormData) {
  const pollId = String(formData.get("pollId") ?? "");
  const optionIdRaw = String(formData.get("optionId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!pollId) throw new Error("Poll required");
  const poll = await getDatePoll(pollId);
  if (!poll) throw new Error("Poll not found");
  if (poll.status === "canceled") throw new Error("This poll was canceled");
  const league = await requirePollLeague(poll.leagueId);
  await requireOrganizer(poll.leagueId);

  const existing = await getEventBySourcePoll(pollId);
  if (existing) redirect(`/events/${existing.id}/manage`);

  // A finalized poll's date is settled — ignore any client-supplied option
  // (e.g. a stale "Pick & create event" button rendered before someone else
  // locked the poll) so the event can never land on a date the poll doesn't
  // announce.
  const optionId =
    poll.status === "finalized"
      ? poll.finalizedOptionId
      : optionIdRaw || null;
  if (!optionId) throw new Error("Pick a date to promote first");
  const [option] = await db
    .select()
    .from(pollOptions)
    .where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, pollId)));
  if (!option) throw new Error("Date not found in this poll");

  const leaguePlayers = await db
    .select()
    .from(players)
    .where(eq(players.leagueId, poll.leagueId));
  const votes = await db
    .select()
    .from(pollVotes)
    .where(eq(pollVotes.optionId, optionId));
  const leagueIds = new Set(leaguePlayers.map((p) => p.id));
  let rosterIds = votes
    .filter((v) => v.response !== "no" && leagueIds.has(v.playerId))
    .map((v) => v.playerId);
  // A thin poll shouldn't block the night — seed the whole league and let the
  // organizer trim the roster on the manage page.
  if (rosterIds.length < 2) {
    rosterIds = leaguePlayers.map((p) => p.id);
  }
  if (rosterIds.length < 2) throw new Error("Need at least 2 players");

  // No transactions on the Neon HTTP driver, so order the writes by
  // recoverability: finalize the poll first (harmless alone — promoting a
  // finalized poll just resumes), then the event, then the roster with a
  // compensating delete so a mid-flight failure can't strand an event the
  // idempotence check would then refuse to rebuild. The unique index on
  // events.source_poll_id closes the concurrent double-promote race.
  if (poll.status === "open") {
    await db
      .update(datePolls)
      .set({ status: "finalized", finalizedOptionId: optionId })
      .where(eq(datePolls.id, pollId));
  }

  const [created] = await db
    .insert(events)
    .values({
      leagueId: poll.leagueId,
      name: name || poll.title,
      scheduledAt: option.startsAt,
      sourcePollId: poll.id,
    })
    .returning();

  const eloByPlayer = new Map(leaguePlayers.map((p) => [p.id, p.currentElo]));
  try {
    await db.insert(eventPlayers).values(
      rosterIds.map((pid, idx) => ({
        eventId: created.id,
        playerId: pid,
        seed: idx + 1,
        startingElo: eloByPlayer.get(pid) ?? 1200,
        joinToken: generateJoinToken(),
      }))
    );
  } catch (err) {
    await db.delete(events).where(eq(events.id, created.id));
    throw err;
  }

  revalidatePath(`/leagues/${league.slug}`);
  revalidatePath(`/leagues/${league.slug}/schedule`);
  revalidatePath(`/leagues/${league.slug}/schedule/${pollId}`);
  redirect(`/events/${created.id}/manage`);
}

// --- The calendar --------------------------------------------------------
// Date polls pick ONE night out of several candidates; the calendar opens a
// run of dates up front and collects a rolling RSVP for each. The two live
// side by side: a poll can still settle an off-schedule night.

function revalidateCalendar(slug: string, nightId?: string) {
  revalidatePath(`/leagues/${slug}`);
  revalidatePath(`/leagues/${slug}/schedule`);
  if (nightId) revalidatePath(`/leagues/${slug}/schedule/nights/${nightId}`);
}

async function requireNight(nightId: string) {
  if (!nightId) throw new Error("Game night required");
  const night = await getGameNight(nightId);
  if (!night) throw new Error("Game night not found");
  const league = await requirePollLeague(night.leagueId);
  return { night, league };
}

/**
 * Open a run of dates on the calendar. The caller sends the fully expanded
 * list of `datetime-local` values (the form builds a recurrence client-side
 * so the organizer sees exactly what they're about to create); dates already
 * on the calendar are skipped rather than duplicated.
 */
export async function createGameNightsAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  if (!leagueId) throw new Error("League required");
  const league = await requirePollLeague(leagueId);
  await requireOrganizer(leagueId);

  const raw = formData
    .getAll("nightDate")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const dates: Date[] = [];
  for (const value of raw) {
    const parsed = parseDateTimeLocal(value);
    if (!parsed) throw new Error(`Couldn't read date "${value}"`);
    if (!dates.some((d) => d.getTime() === parsed.getTime())) {
      dates.push(parsed);
    }
  }
  if (dates.length === 0) throw new Error("Add at least one date");
  if (dates.length > MAX_SERIES_COUNT) {
    throw new Error(`That's more than ${MAX_SERIES_COUNT} dates at once`);
  }

  await db
    .insert(gameNights)
    .values(dates.map((startsAt) => ({ leagueId, startsAt })))
    .onConflictDoNothing({
      target: [gameNights.leagueId, gameNights.startsAt],
    });

  revalidateCalendar(league.slug);
  redirect(`/leagues/${league.slug}/schedule`);
}

/**
 * Player self-service: mark yourself in, out, or maybe for one date, or take
 * the answer back entirely (`response=clear`, which deletes the row and
 * returns you to the un-answered list). Always changeable — the whole point
 * of the calendar is that plans move, and an answer given on the wrong
 * phone or as the wrong wizard has to be undoable.
 */
export async function rsvpGameNightAction(formData: FormData) {
  const nightId = String(formData.get("nightId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  const response = formData.get("response");

  const { night, league } = await requireNight(nightId);
  await requireLeaguePlayer(night.leagueId, playerId);

  if (response === "clear") {
    // Deleting is allowed even on a canceled night: withdrawing an answer
    // can never be the wrong thing to let someone do.
    await db
      .delete(nightRsvps)
      .where(
        and(
          eq(nightRsvps.nightId, nightId),
          eq(nightRsvps.playerId, playerId)
        )
      );
  } else {
    if (night.status === "canceled") throw new Error("This night was canceled");
    if (!isPollResponse(response)) throw new Error("Pick an RSVP");
    await db
      .insert(nightRsvps)
      .values({ nightId, playerId, response })
      .onConflictDoUpdate({
        target: [nightRsvps.nightId, nightRsvps.playerId],
        set: { response: sql`excluded.response`, updatedAt: sql`now()` },
      });
  }

  revalidateCalendar(league.slug, nightId);
}

/** Organizer: fill in the plan for a night — set, host, venue, status. */
export async function updateGameNightAction(formData: FormData) {
  const nightId = String(formData.get("nightId") ?? "");
  const { night, league } = await requireNight(nightId);
  await requireOrganizer(night.leagueId);

  const setName = String(formData.get("setName") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const hostPlayerId = String(formData.get("hostPlayerId") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();

  if (hostPlayerId) {
    await requireLeaguePlayer(night.leagueId, hostPlayerId);
  }
  if (statusRaw && !["planned", "confirmed", "canceled"].includes(statusRaw)) {
    throw new Error("Unknown status");
  }
  let startsAt = night.startsAt;
  if (startsAtRaw) {
    const parsed = parseDateTimeLocal(startsAtRaw);
    if (!parsed) throw new Error(`Couldn't read date "${startsAtRaw}"`);
    startsAt = parsed;
  }

  await db
    .update(gameNights)
    .set({
      startsAt,
      setName: setName || null,
      venue: venue || null,
      notes: notes || null,
      hostPlayerId: hostPlayerId || null,
      status: (statusRaw || night.status) as typeof night.status,
    })
    .where(eq(gameNights.id, nightId));

  revalidateCalendar(league.slug, nightId);
}

/** Organizer: take a date back off the calendar. */
export async function deleteGameNightAction(formData: FormData) {
  const nightId = String(formData.get("nightId") ?? "");
  const { night, league } = await requireNight(nightId);
  await requireOrganizer(night.leagueId);

  const promoted = await getEventBySourceNight(nightId);
  if (promoted) {
    throw new Error(
      "This night already has an event — cancel or delete the event first"
    );
  }

  await db.delete(gameNights).where(eq(gameNights.id, nightId));
  revalidateCalendar(league.slug);
  redirect(`/leagues/${league.slug}/schedule`);
}

/**
 * Turn a calendar night into a real event: pre-rosters everyone who RSVP'd
 * yes or if-need-be, carries the night's set across, and marks the night
 * confirmed. Idempotent — a night that already spawned an event redirects to
 * it, guarded by the unique index on events.source_night_id.
 */
export async function promoteGameNightAction(formData: FormData) {
  const nightId = String(formData.get("nightId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const { night, league } = await requireNight(nightId);
  if (night.status === "canceled") throw new Error("This night was canceled");
  await requireOrganizer(night.leagueId);

  const existing = await getEventBySourceNight(nightId);
  if (existing) redirect(`/events/${existing.id}/manage`);

  const leaguePlayers = await db
    .select()
    .from(players)
    .where(eq(players.leagueId, night.leagueId));
  const rsvps = await db
    .select()
    .from(nightRsvps)
    .where(eq(nightRsvps.nightId, nightId));
  const leagueIds = new Set(leaguePlayers.map((p) => p.id));
  let rosterIds = rsvps
    .filter((r) => r.response !== "no" && leagueIds.has(r.playerId))
    .map((r) => r.playerId);
  // Same escape hatch as promoting a poll: a thin RSVP list shouldn't block
  // the night — seed everyone and let the organizer trim on the manage page.
  if (rosterIds.length < 2) {
    rosterIds = leaguePlayers.map((p) => p.id);
  }
  if (rosterIds.length < 2) throw new Error("Need at least 2 players");

  // No transactions on the Neon HTTP driver — order the writes so a failure
  // mid-flight is recoverable: confirming the night alone is harmless, and
  // the roster insert compensates by deleting the event it belongs to.
  if (night.status === "planned") {
    await db
      .update(gameNights)
      .set({ status: "confirmed" })
      .where(eq(gameNights.id, nightId));
  }

  const [created] = await db
    .insert(events)
    .values({
      leagueId: night.leagueId,
      name: name || `Draft night · ${formatPollDate(night.startsAt)}`,
      scheduledAt: night.startsAt,
      setName: night.setName,
      sourceNightId: night.id,
    })
    .returning();

  const eloByPlayer = new Map(leaguePlayers.map((p) => [p.id, p.currentElo]));
  try {
    await db.insert(eventPlayers).values(
      rosterIds.map((pid, idx) => ({
        eventId: created.id,
        playerId: pid,
        seed: idx + 1,
        startingElo: eloByPlayer.get(pid) ?? 1200,
        joinToken: generateJoinToken(),
      }))
    );
  } catch (err) {
    await db.delete(events).where(eq(events.id, created.id));
    throw err;
  }

  revalidateCalendar(league.slug, nightId);
  redirect(`/events/${created.id}/manage`);
}

/** Rename an event and edit its display metadata (drafted set). */
export async function updateEventAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const setName = String(formData.get("setName") ?? "").trim();

  if (!eventId) throw new Error("Event required");
  if (!name) throw new Error("Event name required");
  const event = await requireOrganizerForEvent(eventId);

  await db
    .update(events)
    .set({
      name,
      setName: setName || null,
    })
    .where(eq(events.id, eventId));

  // Connected broadcast/play clients don't refetch on revalidation, so a
  // mid-tournament rename needs a structural poke. event_state_changed with
  // the unchanged status is exactly that: clients hard-reload and pick up
  // the new name. Draft events have no live clients (and the message schema
  // only admits active/complete), so skip them.
  if (event.status === "active" || event.status === "complete") {
    await publish(eventId, {
      type: "event_state_changed",
      status: event.status,
    });
  }

  const league = await requirePollLeague(event.leagueId);
  revalidatePath(`/leagues/${league.slug}`);
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}/play`);
  revalidatePath(`/events/${eventId}/broadcast`);
  revalidatePath(`/events/${eventId}/claim`);
}

/**
 * Revoke the no-login organizer grants held by this browser. Paired with
 * authClient.signOut() in SignOutButton so "Sign out" actually de-authorizes
 * the device — the mtg_org_* cookies outrank the session in authz.ts.
 */
export async function deauthorizeDeviceAction() {
  await clearOrganizerCookies();
}

/* ---- league management (organizer accounts) ---- */

// "new" would shadow the static /leagues/new route; the rest are plausible
// future static segments under /leagues/.
const RESERVED_LEAGUE_SLUGS = new Set(["new", "join", "settings"]);

export async function createLeagueAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();

  if (!name) throw new Error("League name required");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug)) {
    throw new Error(
      "Slug must be 1–48 lowercase letters, numbers, or hyphens (no leading/trailing hyphen)"
    );
  }
  if (RESERVED_LEAGUE_SLUGS.has(slug)) {
    throw new Error("That slug is reserved — pick another");
  }

  const user = await getSessionUser();
  if (!user) throw new Error("Sign in to create a league");

  const [existing] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.slug, slug));
  if (existing) throw new Error("That slug is taken — pick another");

  // No transactions on the neon-http driver: insert the league (with owner
  // set) first, membership row second. Losing the second write degrades
  // gracefully — the owner check passes via owner_user_id alone.
  const [league] = await db
    .insert(leagues)
    .values({
      slug,
      name,
      ownerUserId: user.id,
      organizerToken: generateJoinToken(),
      managerInviteToken: generateJoinToken(),
    })
    .returning();
  await db
    .insert(leagueMembers)
    .values({ leagueId: league.id, userId: user.id, role: "owner" })
    .onConflictDoNothing();

  revalidatePath("/");
  redirect(`/leagues/${league.slug}`);
}

export async function acceptManagerInviteAction(formData: FormData) {
  const leagueSlug = String(formData.get("leagueSlug") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  if (!leagueSlug || !token) throw new Error("Invalid invite link");

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.slug, leagueSlug));
  if (!league || !league.managerInviteToken || league.managerInviteToken !== token) {
    throw new Error("This invite link is no longer valid");
  }

  const user = await getSessionUser();
  if (!user) throw new Error("Sign in to accept the invite");

  await db
    .insert(leagueMembers)
    .values({ leagueId: league.id, userId: user.id, role: "organizer" })
    .onConflictDoNothing();

  revalidatePath(`/leagues/${league.slug}`);
  revalidatePath(`/leagues/${league.slug}/settings`);
  revalidatePath("/");
  redirect(`/leagues/${league.slug}`);
}

export async function rotateOrganizerTokenAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  if (!leagueId) throw new Error("League required");
  await requireOrganizer(leagueId);

  const token = generateJoinToken();
  const [league] = await db
    .update(leagues)
    .set({ organizerToken: token })
    .where(eq(leagues.id, leagueId))
    .returning();
  // Rotation kills every outstanding organizer link AND cookie at once. Keep
  // the rotator themselves in — they may be here via the old cookie.
  await setOrganizerCookie(leagueId, token);

  revalidatePath(`/leagues/${league.slug}/settings`);
}

export async function rotateManagerInviteTokenAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  if (!leagueId) throw new Error("League required");
  await requireOrganizer(leagueId);

  const [league] = await db
    .update(leagues)
    .set({ managerInviteToken: generateJoinToken() })
    .where(eq(leagues.id, leagueId))
    .returning();

  revalidatePath(`/leagues/${league.slug}/settings`);
}

export async function removeLeagueMemberAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!leagueId || !userId) throw new Error("League and member required");
  await requireOrganizer(leagueId);

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, leagueId));
  if (!league) throw new Error("League not found");
  if (league.ownerUserId === userId) {
    throw new Error("The league owner can't be removed");
  }

  await db
    .delete(leagueMembers)
    .where(
      and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId))
    );

  revalidatePath(`/leagues/${league.slug}/settings`);
}
