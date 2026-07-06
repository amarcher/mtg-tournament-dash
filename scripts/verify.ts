/**
 * End-to-end verification harness.
 *
 *   npm run verify
 *
 * Creates an isolated 8-player tournament under a `_verify_` prefix, drives
 * every code path (game-by-game phone reports, organizer overrides, a draw,
 * a premature round-end attempt that should throw, ELO updates, full event
 * completion), then deletes everything it created. If the dev/prod server is
 * reachable on $VERIFY_PORT (default 3002), it also fetches every page route
 * and asserts a 200 + a few key markers.
 *
 * Idempotent: cleans up any leftover `_verify_` rows on entry and exit, so
 * a crashed previous run can't break the next one.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { eq, like, and, isNull } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../src/db/client";
import {
  events,
  eventPlayers,
  games,
  leagues,
  matches,
  players,
  rounds,
} from "../src/db/schema";
import {
  addManualPairingAction,
  addRoundAction,
  cancelPendingRoundAction,
  castPollVotesAction,
  completeRoundAction,
  confirmRoundAction,
  createDatePollAction,
  dropPendingMatchAction,
  endEventAction,
  finalizeDatePollAction,
  previewNextRoundAction,
  reopenEventAction,
  regeneratePendingPairingsAction,
  setMatchResultAction,
  startNextRoundAction,
  swapMatchPlayersAction,
} from "../src/app/events/actions";
import { applyGameWinner, applyLifeAdjust } from "../src/lib/match-mutations";
import { addPlayerToEventRoster } from "../src/lib/event-roster";
import { startWizardGeneration } from "../src/lib/wizard-job";
import { generateJoinToken } from "../src/lib/auth";
import {
  getActiveMatchForPlayer,
  getCurrentRound,
  getDatePoll,
  getEventMatchHistory,
  getEventRoster,
  getEventRounds,
  getEventStandings,
  getPendingRound,
  getPollDetail,
  getRoundMatches,
} from "../src/db/queries";
import { pickLeadingOptionId } from "../src/lib/poll-tally";
import { datePolls } from "../src/db/schema";

const PREFIX = "_verify_";
const VERIFY_PORT = process.env.VERIFY_PORT ?? "3002";

let okCount = 0;
let failCount = 0;

function ok(msg: string) {
  okCount++;
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string, err?: unknown) {
  failCount++;
  console.log(`  ✗ ${msg}`);
  if (err) console.log(`      ${err instanceof Error ? err.message : err}`);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (cond) ok(msg);
  else throw new Error(`assertion failed: ${msg}`);
}

async function cleanup() {
  // Delete events first so the matches/elo_changes cascade clears out the
  // elo_changes rows that reference players (elo_changes.player_id has no
  // ON DELETE CASCADE). Then deleting the league cascades to its players.
  await db.delete(events).where(like(events.name, `${PREFIX}%`));
  await db.delete(leagues).where(like(leagues.slug, `${PREFIX}%`));
}

async function setupEvent(playerCount: number) {
  const slug = `${PREFIX}league`;
  const [league] = await db
    .insert(leagues)
    .values({ slug, name: `${PREFIX}League` })
    .returning();

  const inserted = await db
    .insert(players)
    .values(
      Array.from({ length: playerCount }, (_, i) => ({
        leagueId: league.id,
        leagueToken: generateJoinToken(),
        displayName: `${PREFIX}P${i + 1}`,
      }))
    )
    .returning();

  const [event] = await db
    .insert(events)
    .values({
      leagueId: league.id,
      name: `${PREFIX}event`,
      totalRounds: 3,
      startingLife: 20,
    })
    .returning();

  await db.insert(eventPlayers).values(
    inserted.map((p, i) => ({
      eventId: event.id,
      playerId: p.id,
      seed: i + 1,
      startingElo: p.currentElo,
      joinToken: generateJoinToken(),
    }))
  );

  return { event, league, players: inserted };
}

function makeFormData(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) for (const item of v) fd.append(k, item);
    else fd.set(k, v);
  }
  return fd;
}

// Actions that end in redirect() throw NEXT_REDIRECT even outside a request
// scope — for the harness that's the success path, not a failure.
function isNextRedirect(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

async function driveRound1ViaPhones(eventId: string) {
  await startNextRoundAction(eventId);
  const round = await getCurrentRound(eventId);
  assert(round, "round 1 active after startNextRoundAction");
  const ms = await getRoundMatches(round!.id);

  // Exercise the life-adjust path on table 1 before reporting.
  const t1 = ms.find((m) => m.playerB);
  if (t1) {
    const [g1] = await db
      .select()
      .from(games)
      .where(and(eq(games.matchId, t1.match.id), isNull(games.winnerId)))
      .orderBy(games.gameNumber)
      .limit(1);
    assert(g1, "active game exists for table 1");
    const res = await applyLifeAdjust({
      matchId: t1.match.id,
      side: "a",
      delta: -3,
      gameId: g1.id,
      expectedLife: g1.playerALife,
    });
    assert(
      res.ok && res.life === g1.playerALife - 3,
      "applyLifeAdjust returns the new life total"
    );
    // Compare-and-set rejects a write whose expected life no longer holds
    // (e.g. a duplicated/retried tap or a stale cross-game delta).
    const stale = await applyLifeAdjust({
      matchId: t1.match.id,
      side: "a",
      delta: -1,
      gameId: g1.id,
      expectedLife: g1.playerALife,
    });
    assert(
      !stale.ok && stale.reason === "stale_life",
      "applyLifeAdjust rejects a stale-expected write"
    );
  }

  for (const { match, playerA, playerB } of ms) {
    if (!playerB) continue;
    const winner =
      playerA.displayName < playerB.displayName ? playerA : playerB;
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
  }
  await completeRoundAction(eventId);
}

async function driveRound2WithOverridesAndDraw(eventId: string) {
  await startNextRoundAction(eventId);
  const round = await getCurrentRound(eventId);
  const ms = await getRoundMatches(round!.id);
  const real = ms.filter((m) => m.playerB);

  // First match: a draw via override
  await setMatchResultAction(
    makeFormData({
      matchId: real[0].match.id,
      outcome: "draw",
    })
  );

  // Remaining: a/b override based on names
  for (const { match, playerA, playerB } of real.slice(1)) {
    await setMatchResultAction(
      makeFormData({
        matchId: match.id,
        outcome:
          playerA.displayName < playerB!.displayName ? "a" : "b",
      })
    );
  }
  await completeRoundAction(eventId);
}

async function driveRound3WithPrematureEnd(eventId: string) {
  await startNextRoundAction(eventId);
  const round = await getCurrentRound(eventId);
  const ms = await getRoundMatches(round!.id);
  const real = ms.filter((m) => m.playerB);

  // Resolve all but one match.
  for (const { match, playerA, playerB } of real.slice(0, -1)) {
    await setMatchResultAction(
      makeFormData({
        matchId: match.id,
        outcome:
          playerA.displayName < playerB!.displayName ? "a" : "b",
      })
    );
  }

  // Premature complete should throw.
  let threw = false;
  try {
    await completeRoundAction(eventId);
  } catch {
    threw = true;
  }
  assert(threw, "completeRoundAction throws when matches still in progress");

  // Resolve the last and complete normally.
  const last = real[real.length - 1];
  await setMatchResultAction(
    makeFormData({
      matchId: last.match.id,
      outcome:
        last.playerA.displayName < last.playerB!.displayName ? "a" : "b",
    })
  );
  await completeRoundAction(eventId);
}

/**
 * End-to-end wizardize: drive `startWizardGeneration` against the local FLUX
 * server using a bundled fixture selfie, assert all three tier files land on
 * disk and the player row gets all three URL columns populated, then clean
 * up the generated jpgs (the player row itself is purged by `cleanup()`).
 *
 * Skips silently when FLUX isn't reachable or `SKIP_FLUX=1` is set, so this
 * doesn't block CI environments without the local image-gen server.
 */
async function runWizardizeIntegrationTest(playerId: string) {
  if (process.env.SKIP_FLUX === "1") {
    console.log("  · wizardize skipped (SKIP_FLUX=1)");
    return;
  }

  // Probe FLUX before starting — we don't want to wait 30s for a hard timeout.
  const fluxUrl = process.env.IMAGEGEN_URL ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${fluxUrl}/health`, { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch {
    console.log(
      `  · wizardize skipped (no FLUX server on ${fluxUrl}; export SKIP_FLUX=1 to silence)`
    );
    return;
  }

  const fixturePath = join(
    process.cwd(),
    "scripts",
    "fixtures",
    "test-selfie.jpg"
  );
  let selfieBytes: Buffer;
  try {
    selfieBytes = await readFile(fixturePath);
  } catch {
    fail(`wizardize skipped: fixture missing at ${fixturePath}`);
    return;
  }

  const t0 = Date.now();
  // Drive the domain core directly — the generateWizardAction wrapper now
  // authorizes via the league cookie, which doesn't exist outside a request.
  await startWizardGeneration({
    playerId,
    archetype: "frost mage",
    freeform: "",
    selfie: new File([new Uint8Array(selfieBytes)], "test-selfie.jpg", {
      type: "image/jpeg",
    }),
  });
  // The core returns immediately and runs FLUX in the background. Poll the
  // DB until wizard_job_started_at clears (success or failure).
  let row: {
    avatarUrl: string | null;
    avatarWoundedUrl: string | null;
    avatarCriticalUrl: string | null;
    avatarVictoryUrl: string | null;
    avatarDefeatUrl: string | null;
    selfieUrl: string | null;
    wizardArchetype: string | null;
    wizardJobStartedAt: Date | null;
  } | undefined;
  // 5 tiers × ~30 s each = up to 3 min of FLUX work. Generous deadline.
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    [row] = await db
      .select({
        avatarUrl: players.avatarUrl,
        avatarWoundedUrl: players.avatarWoundedUrl,
        avatarCriticalUrl: players.avatarCriticalUrl,
        avatarVictoryUrl: players.avatarVictoryUrl,
        avatarDefeatUrl: players.avatarDefeatUrl,
        selfieUrl: players.selfieUrl,
        wizardArchetype: players.wizardArchetype,
        wizardJobStartedAt: players.wizardJobStartedAt,
      })
      .from(players)
      .where(eq(players.id, playerId));
    if (row && row.wizardJobStartedAt === null && row.avatarUrl !== null) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!row) {
    fail("could not read player row");
    return;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  ok(`startWizardGeneration completed end-to-end against FLUX (${elapsed}s)`);
  // Storage shape depends on env: with BLOB_READ_WRITE_TOKEN the pipeline
  // writes absolute Vercel Blob URLs keyed `avatars/<playerId>/<tier>.jpg`;
  // without it, the legacy PUT-to-image-gen path stores `/files/wizard-...`.
  const blobMode = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const tiers = {
    fresh: row.avatarUrl,
    wounded: row.avatarWoundedUrl,
    critical: row.avatarCriticalUrl,
    victory: row.avatarVictoryUrl,
    defeat: row.avatarDefeatUrl,
  } as const;
  for (const [tier, url] of Object.entries(tiers)) {
    const expected = blobMode
      ? `avatars/${playerId}/${tier}.jpg`
      : `wizard-${playerId}-${tier}.jpg`;
    assert(
      url?.includes(expected),
      `${tier} URL written to players.avatar_*_url (${expected})`
    );
  }
  assert(
    row.selfieUrl?.includes(
      blobMode ? `avatars/${playerId}/selfie.jpg` : `selfie-${playerId}.jpg`
    ),
    "selfie URL persisted"
  );
  assert(row.wizardArchetype === "frost mage", "wizardArchetype persisted");
  if (blobMode) {
    assert(
      row.avatarUrl?.startsWith("https://"),
      "URLs are absolute Blob URLs"
    );
  } else {
    assert(row.avatarUrl?.startsWith("/files/"), "URLs point at /files/");
    assert(row.avatarUrl?.includes("?v="), "fresh URL has cache-buster");
  }

  // Each stored variant should be a real JPEG, not a 0-byte error response.
  for (const [tier, url] of Object.entries(tiers)) {
    if (!url) continue;
    const probeUrl = url.startsWith("http") ? url : `${fluxUrl}${url}`;
    const res = await fetch(probeUrl);
    if (!res.ok) {
      fail(`${tier} variant GET → ${res.status}`);
      continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    assert(
      bytes.length > 50_000,
      `${tier} variant > 50KB in storage (${bytes.length} B)`
    );
  }

  // Clean up the uploaded artifacts for this throwaway player.
  if (blobMode) {
    const { del } = await import("@vercel/blob");
    const keys = [...Object.keys(tiers), "selfie"].map(
      (t) => `avatars/${playerId}/${t}.jpg`
    );
    await del(keys).catch(() => undefined);
  } else {
    const token = process.env.IMAGEGEN_FILES_TOKEN ?? "";
    for (const name of [
      ...Object.keys(tiers).map((tier) => `wizard-${playerId}-${tier}.jpg`),
      `selfie-${playerId}.jpg`,
    ]) {
      await fetch(`${fluxUrl}/files/${name}`, {
        method: "DELETE",
        headers: { "X-Files-Token": token },
      }).catch(() => undefined);
    }
  }
  ok("post-clean generated wizard/selfie files");
}

/**
 * 6-player Swiss correctness pass. Asserts the exact pairing structure the
 * organizer expects on game night:
 *   • R1: all 6 paired into 3 matches.
 *   • R2: exactly one W-vs-W, one L-vs-L, and one cross (W-vs-L) match.
 *     No rematches.
 *   • R3: small matchpoint diffs only, no rematches across the event.
 *   • Final: event auto-completes, standings sorted, final_standing 1..6.
 *
 * Drives every match via the phone path (reportGameWinnerAction × 2 = 2-0 BO3
 * sweep) so we exercise the same code paths a real tournament uses.
 */
async function runSixPlayerSwissPass() {
  console.log("\n--- 6-player Swiss correctness pass ---");
  await cleanup();

  const { event } = await setupEvent(6);
  ok(`set up 6-player event ${event.id.slice(0, 8)}`);

  // === Round 1 ===
  await startNextRoundAction(event.id);
  let round = await getCurrentRound(event.id);
  let ms = await getRoundMatches(round!.id);
  assert(ms.length === 3, "R1: exactly 3 matches");
  assert(ms.every((m) => m.playerB !== null), "R1: no bye (even count)");

  for (const { match, playerA, playerB } of ms) {
    if (!playerB) continue;
    const winner =
      playerA.displayName < playerB.displayName ? playerA : playerB;
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
  }
  await completeRoundAction(event.id);

  let standings = await getEventStandings(event.id);
  const r1Winners = new Set(
    standings.filter((s) => s.matchPoints === 3).map((s) => s.playerId)
  );
  const r1Losers = new Set(
    standings.filter((s) => s.matchPoints === 0).map((s) => s.playerId)
  );
  assert(r1Winners.size === 3, "R1: 3 winners at 3 pts");
  assert(r1Losers.size === 3, "R1: 3 losers at 0 pts");

  // === Round 2 ===
  await startNextRoundAction(event.id);
  round = await getCurrentRound(event.id);
  ms = await getRoundMatches(round!.id);
  assert(ms.length === 3, "R2: exactly 3 matches");
  assert(ms.every((m) => m.playerB !== null), "R2: no bye");

  const tier = (id: string) => (r1Winners.has(id) ? "W" : "L");
  const r2Tiers = ms.map(({ playerA, playerB }) =>
    [tier(playerA.id), tier(playerB!.id)].sort().join("")
  );
  assert(
    r2Tiers.filter((t) => t === "WW").length === 1,
    "R2: exactly one W-vs-W match"
  );
  assert(
    r2Tiers.filter((t) => t === "LL").length === 1,
    "R2: exactly one L-vs-L match"
  );
  assert(
    r2Tiers.filter((t) => t === "LW").length === 1,
    "R2: exactly one cross (W-vs-L) match"
  );

  // Cumulative pair set, for rematch checking.
  const seenPairs = new Set<string>();
  const r1Round = (await getEventRounds(event.id)).find(
    (r) => r.roundNumber === 1
  )!;
  for (const m of await getRoundMatches(r1Round.id)) {
    if (m.playerB) seenPairs.add([m.playerA.id, m.playerB.id].sort().join("|"));
  }
  for (const m of ms) {
    const k = [m.playerA.id, m.playerB!.id].sort().join("|");
    assert(!seenPairs.has(k), `R2 pair is not an R1 rematch`);
    seenPairs.add(k);
  }

  for (const { match, playerA, playerB } of ms) {
    if (!playerB) continue;
    const winner =
      playerA.displayName < playerB.displayName ? playerA : playerB;
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
  }
  await completeRoundAction(event.id);

  standings = await getEventStandings(event.id);
  const pointsById = new Map(standings.map((s) => [s.playerId, s.matchPoints]));

  // === Round 3 ===
  await startNextRoundAction(event.id);
  round = await getCurrentRound(event.id);
  ms = await getRoundMatches(round!.id);
  assert(ms.length === 3, "R3: exactly 3 matches");
  assert(ms.every((m) => m.playerB !== null), "R3: no bye");

  for (const m of ms) {
    const k = [m.playerA.id, m.playerB!.id].sort().join("|");
    assert(!seenPairs.has(k), `R3 pair is not a prior rematch`);
    seenPairs.add(k);

    const pa = pointsById.get(m.playerA.id)!;
    const pb = pointsById.get(m.playerB!.id)!;
    // Swiss should keep matchpoint diffs tight. With 6 players the worst
    // achievable diff after R2 (given the rematch constraint) is 3.
    assert(
      Math.abs(pa - pb) <= 3,
      `R3 pair ${m.playerA.displayName}(${pa}) vs ${m.playerB!.displayName}(${pb}): diff ≤ 3`
    );
  }

  for (const { match, playerA, playerB } of ms) {
    if (!playerB) continue;
    const winner =
      playerA.displayName < playerB.displayName ? playerA : playerB;
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
  }
  await completeRoundAction(event.id);

  // === Final assertions ===
  const [final] = await db.select().from(events).where(eq(events.id, event.id));
  assert(final.status === "complete", "6p event auto-marked complete");

  const finalStandings = await getEventStandings(event.id);
  assert(finalStandings.length === 6, "final standings: 6 players");
  for (const s of finalStandings) {
    assert(
      s.opponentsFaced.length === 3 && new Set(s.opponentsFaced).size === 3,
      `${s.displayName}: 3 unique opponents`
    );
  }
  for (let i = 1; i < finalStandings.length; i++) {
    const prev = finalStandings[i - 1];
    const cur = finalStandings[i];
    const order =
      prev.matchPoints > cur.matchPoints
        ? true
        : prev.matchPoints < cur.matchPoints
          ? false
          : prev.opponentMatchWinPct > cur.opponentMatchWinPct
            ? true
            : prev.opponentMatchWinPct < cur.opponentMatchWinPct
              ? false
              : prev.gameWinPct > cur.gameWinPct
                ? true
                : prev.gameWinPct < cur.gameWinPct
                  ? false
                  : prev.opponentGameWinPct > cur.opponentGameWinPct
                    ? true
                    : prev.opponentGameWinPct < cur.opponentGameWinPct
                      ? false
                      : prev.currentElo >= cur.currentElo;
    assert(
      order,
      `final standings row ${i - 1} ≥ row ${i} (MTG tiebreakers)`
    );
  }
  // GW% sanity for the 6-player run: P1 swept 3 matches (2-0 each) → 6/6
  // games → 100% GW%. P6 lost every match (0-2 each) → 0/6 games → 0% GW%.
  const top = finalStandings[0];
  const bot = finalStandings[finalStandings.length - 1];
  assert(top.gameWinPct === 1, "top player has 100% GW%");
  assert(bot.gameWinPct === 0, "bottom player has 0% GW%");

  const finalRoster = await db
    .select({
      playerId: eventPlayers.playerId,
      finalStanding: eventPlayers.finalStanding,
    })
    .from(eventPlayers)
    .where(eq(eventPlayers.eventId, event.id));
  const fsValues = finalRoster
    .map((r) => r.finalStanding)
    .sort((a, b) => (a ?? 0) - (b ?? 0));
  assert(
    JSON.stringify(fsValues) === JSON.stringify([1, 2, 3, 4, 5, 6]),
    "event_players.final_standing populated 1..6"
  );

  // Print a tidy leaderboard so the operator can eyeball it.
  console.log("\n  Final leaderboard (6p):");
  console.log(
    "    #  Player                MP  W-L-D   OMW%   GW%   OGW%   ELO"
  );
  for (let i = 0; i < finalStandings.length; i++) {
    const s = finalStandings[i];
    const pct = (n: number) => (n * 100).toFixed(1).padStart(5);
    console.log(
      `    ${(i + 1).toString().padStart(2)}. ${s.displayName.padEnd(20)} ` +
        `${s.matchPoints.toString().padStart(2)}  ` +
        `${s.wins}-${s.losses}-${s.draws}   ` +
        `${pct(s.opponentMatchWinPct)} ${pct(s.gameWinPct)} ${pct(
          s.opponentGameWinPct
        )}  ${s.currentElo}`
    );
  }
  console.log("");

  ok("6-player Swiss: clean leaderboard after 3 rounds");

  // === Final-ranking data shape ===
  const history = await getEventMatchHistory(event.id);
  const roster6 = await getEventRoster(event.id);
  const startingEloById6 = new Map(
    roster6.map((r) => [r.playerId, r.startingElo])
  );
  for (const s of finalStandings) {
    const rows = history[s.playerId] ?? [];
    assert(rows.length === 3, `${s.displayName}: 3 rounds in match history`);
    assert(
      rows.every((r, i) => r.roundNumber === i + 1),
      `${s.displayName}: history rounds are 1..3 in order`
    );
    assert(
      rows.every((r) => r.outcome === "W" || r.outcome === "L" || r.outcome === "BYE"),
      `${s.displayName}: every row has a sane outcome`
    );
    // Each decisive match writes an eloChanges row → eloDelta should be set.
    assert(
      rows.every((r) => r.outcome === "BYE" || typeof r.eloDelta === "number"),
      `${s.displayName}: decisive history rows carry an ELO delta`
    );

    const eventDelta = rows.reduce((acc, r) => acc + (r.eloDelta ?? 0), 0);
    const startingElo = startingEloById6.get(s.playerId)!;
    assert(
      startingElo + eventDelta === s.currentElo,
      `${s.displayName}: startingElo + Σ deltas == currentElo`
    );
  }
  // Round-1 sweep winner should show three Ws; sweep loser should show three Ls.
  const topHistory = history[finalStandings[0].playerId] ?? [];
  const botHistory =
    history[finalStandings[finalStandings.length - 1].playerId] ?? [];
  assert(
    topHistory.every((r) => r.outcome === "W"),
    "top player history is all W"
  );
  assert(
    botHistory.every((r) => r.outcome === "L"),
    "bottom player history is all L"
  );

  await cleanup();
  ok("post-clean 6-player rows");
}

/**
 * Exercise the new manage-page flows: preview-then-confirm with a manual swap,
 * a "drop pair" excuse that carries an in-progress match into the next round,
 * a phone-side `reportMatchDrawAction`, and the `getActiveMatchForPlayer`
 * fallback that finds an in_progress match even after its round closed.
 */
async function runReviewFlowPass() {
  console.log("\n--- pairing review + excused pair pass ---");
  await cleanup();

  const { event } = await setupEvent(6);
  ok(`set up 6-player event ${event.id.slice(0, 8)} for review-flow pass`);

  // --- R1: drive via reportMatchDrawAction on one match, decisive on others
  await previewNextRoundAction(event.id);
  const r1Pending = await getPendingRound(event.id);
  assert(r1Pending !== null, "previewNextRoundAction creates a pending round");

  let r1Matches = await getRoundMatches(r1Pending!.id);
  assert(
    r1Matches.length === 3 && r1Matches.every((m) => m.match.status === "pending"),
    "pending round has 3 pending matches"
  );

  // Swap a player from T1 with a player from T2 and confirm both matches stay
  // well-formed.
  const t1 = r1Matches[0];
  const t2 = r1Matches[1];
  const beforeAId = t1.match.playerAId;
  const beforeBId = t2.match.playerBId!;
  await swapMatchPlayersAction({
    matchAId: t1.match.id,
    sideA: "a",
    matchBId: t2.match.id,
    sideB: "b",
  });
  r1Matches = await getRoundMatches(r1Pending!.id);
  assert(
    r1Matches.find((m) => m.match.id === t1.match.id)!.match.playerAId ===
      beforeBId,
    "swap moved player to T1 side A"
  );
  assert(
    r1Matches.find((m) => m.match.id === t2.match.id)!.match.playerBId ===
      beforeAId,
    "swap moved player to T2 side B"
  );

  await confirmRoundAction(event.id);
  const round = await getCurrentRound(event.id);
  assert(round?.roundNumber === 1, "confirmed round is now active R1");

  const r1Active = await getRoundMatches(round!.id);
  // Pick one match to end as a draw; others decisive. (Driven via the
  // organizer override here since the harness has no participant cookie for
  // the phone-side reportMatchDrawAction; both funnel through the same
  // finalize path.)
  await setMatchResultAction(
    makeFormData({ matchId: r1Active[0].match.id, outcome: "draw" })
  );
  const [drawn] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, r1Active[0].match.id));
  assert(drawn.status === "complete" && drawn.isDraw === true,
    "draw marks the match complete + isDraw");

  for (const { match, playerA, playerB } of r1Active.slice(1)) {
    if (!playerB) continue;
    const winner = playerA.displayName < playerB.displayName ? playerA : playerB;
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
  }
  await completeRoundAction(event.id);
  ok("R1 — drove a phone-side match draw alongside decisive results");

  // --- R2: pending preview, re-roll, then drop a pair (they keep playing R1)
  // First: stage an in-progress R1 match that we'll carry past the round.
  // We need to mimic an excused pair, so leave one match unfinished. Restart:
  // simpler — preview R2, then forcibly create an in_progress carryover match
  // in R1 by inserting a fresh game row.
  await previewNextRoundAction(event.id);
  let r2Pending = await getPendingRound(event.id);
  assert(r2Pending !== null, "R2 pending round created");

  await regeneratePendingPairingsAction(event.id);
  r2Pending = await getPendingRound(event.id);
  let r2Matches = await getRoundMatches(r2Pending!.id);
  assert(
    r2Matches.length === 3,
    "regenerate kept the pending round with 3 matches"
  );

  // Excuse the first pair from R2 — they're going to keep playing.
  const excusedPair = r2Matches[0];
  const excusedAId = excusedPair.match.playerAId;
  const excusedBId = excusedPair.match.playerBId!;
  await dropPendingMatchAction({ matchId: excusedPair.match.id });
  r2Matches = await getRoundMatches(r2Pending!.id);
  assert(r2Matches.length === 2, "drop pair removed the match");

  // Open a fresh R1 in_progress match for the excused pair so we can verify
  // getActiveMatchForPlayer picks it up after R2 starts. (In real life this
  // would be a leftover match the round closed prematurely; here we synthesize
  // the equivalent state.)
  const [carryRound] = await db
    .insert(rounds)
    .values({
      eventId: event.id,
      roundNumber: 99, // sentinel — not a real round, just an in-progress holder
      status: "complete",
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .returning();
  const [carryMatch] = await db
    .insert(matches)
    .values({
      roundId: carryRound.id,
      tableNumber: 99,
      playerAId: excusedAId,
      playerBId: excusedBId,
      status: "in_progress",
    })
    .returning();
  await db.insert(games).values({
    matchId: carryMatch.id,
    gameNumber: 1,
    playerALife: 20,
    playerBLife: 20,
  });

  await confirmRoundAction(event.id);
  ok("R2 confirmed with one pair excused (drop pair)");

  // Excused players' active match should be the carryover, not anything in R2.
  const aActive = await getActiveMatchForPlayer(event.id, excusedAId);
  assert(
    aActive?.id === carryMatch.id,
    "excused player A still points at the carried in_progress match"
  );
  const bActive = await getActiveMatchForPlayer(event.id, excusedBId);
  assert(
    bActive?.id === carryMatch.id,
    "excused player B still points at the carried in_progress match"
  );

  // Done verifying the carry semantics — tear down the synthetic round so the
  // rest of the pass operates on the natural R1+R2 history and isn't polluted
  // by an extra "complete" round inflating event.totalRounds bookkeeping.
  await db.delete(games).where(eq(games.matchId, carryMatch.id));
  await db.delete(matches).where(eq(matches.id, carryMatch.id));
  await db.delete(rounds).where(eq(rounds.id, carryRound.id));

  // Finish R2's pending matches so the round is closeable.
  const r2Live = await getRoundMatches((await getCurrentRound(event.id))!.id);
  for (const { match, playerA, playerB } of r2Live) {
    if (!playerB) continue;
    const winner = playerA.displayName < playerB.displayName ? playerA : playerB;
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
    await applyGameWinner({ matchId: match.id, winnerId: winner.id });
  }
  await completeRoundAction(event.id);

  await previewNextRoundAction(event.id);
  const r3Pending = await getPendingRound(event.id);
  assert(r3Pending !== null, "R3 preview created");
  await cancelPendingRoundAction(event.id);
  const r3PendingAfterCancel = await getPendingRound(event.id);
  assert(
    r3PendingAfterCancel === null,
    "cancelPendingRoundAction tears down the pending round"
  );

  // Re-preview and add a manual pairing on top of auto-generated ones to
  // exercise addManualPairingAction's roster + duplicate-pair checks.
  await previewNextRoundAction(event.id);
  const r3FreshPending = await getPendingRound(event.id);
  const r3FreshMatches = await getRoundMatches(r3FreshPending!.id);
  // Drop one match so two players are unpaired, then re-add them manually.
  const dropMe = r3FreshMatches[0];
  const unpairedA = dropMe.match.playerAId;
  const unpairedB = dropMe.match.playerBId!;
  await dropPendingMatchAction({ matchId: dropMe.match.id });
  await addManualPairingAction({
    roundId: r3FreshPending!.id,
    playerAId: unpairedA,
    playerBId: unpairedB,
  });
  const r3FinalMatches = await getRoundMatches(r3FreshPending!.id);
  assert(
    r3FinalMatches.some(
      (m) =>
        (m.match.playerAId === unpairedA && m.match.playerBId === unpairedB) ||
        (m.match.playerAId === unpairedB && m.match.playerBId === unpairedA)
    ),
    "addManualPairingAction re-paired the dropped pair"
  );

  // Double-pair should throw.
  let pairThrew = false;
  try {
    await addManualPairingAction({
      roundId: r3FreshPending!.id,
      playerAId: unpairedA,
      playerBId: unpairedB,
    });
  } catch {
    pairThrew = true;
  }
  assert(pairThrew, "addManualPairingAction rejects already-paired players");

  await cleanup();
  ok("post-clean review-flow rows");
}

/**
 * Exercise `endEventAction`: drive only 2 of a 3-round event, then end early and
 * assert the winner is tabulated from the rounds actually played — finalStanding
 * is a 1..N permutation, rank 1 matches the top of standings, and the completed
 * event refuses further rounds.
 */
async function runEndEarlyPass() {
  console.log("\n--- end-event-early pass ---");
  await cleanup();

  const { event, players: tp } = await setupEvent(8);
  ok(`set up 8-player event ${event.id.slice(0, 8)} for end-early pass`);

  await driveRound1ViaPhones(event.id);
  await driveRound2WithOverridesAndDraw(event.id);
  ok("drove 2 of 3 scheduled rounds");

  const [mid] = await db.select().from(events).where(eq(events.id, event.id));
  assert(mid.status === "active", "event still active after 2 of 3 rounds");

  const standingsBefore = await getEventStandings(event.id);
  await endEventAction(event.id);

  const [ended] = await db.select().from(events).where(eq(events.id, event.id));
  assert(
    ended.status === "complete",
    "endEventAction marks the event complete after only 2 rounds"
  );

  const finals = await db
    .select({
      playerId: eventPlayers.playerId,
      finalStanding: eventPlayers.finalStanding,
    })
    .from(eventPlayers)
    .where(eq(eventPlayers.eventId, event.id));
  assert(
    finals.every((f) => f.finalStanding !== null),
    "every player got a finalStanding on early end"
  );
  const ranks = finals.map((f) => f.finalStanding!).sort((a, b) => a - b);
  assert(
    ranks.length === tp.length && ranks.every((r, i) => r === i + 1),
    "finalStanding values are a 1..N permutation"
  );
  const winner = finals.find((f) => f.finalStanding === 1)!;
  assert(
    winner.playerId === standingsBefore[0].playerId,
    "rank 1 matches the top of standings at end time"
  );

  let endThrew = false;
  try {
    await endEventAction(event.id);
  } catch {
    endThrew = true;
  }
  assert(endThrew, "endEventAction throws on an already-complete event");

  let previewThrew = false;
  try {
    await previewNextRoundAction(event.id);
  } catch {
    previewThrew = true;
  }
  assert(
    previewThrew,
    "previewNextRoundAction refuses a completed event (no sprouting a new round)"
  );

  // Reopen undoes the completion: status back to active, placements cleared.
  await reopenEventAction(event.id);
  const [reopened] = await db
    .select()
    .from(events)
    .where(eq(events.id, event.id));
  assert(reopened.status === "active", "reopenEventAction sets event back to active");
  const clearedFinals = await db
    .select({ finalStanding: eventPlayers.finalStanding })
    .from(eventPlayers)
    .where(eq(eventPlayers.eventId, event.id));
  assert(
    clearedFinals.every((f) => f.finalStanding === null),
    "reopenEventAction clears every finalStanding"
  );

  // Reopening a non-complete event throws.
  let reopenThrew = false;
  try {
    await reopenEventAction(event.id);
  } catch {
    reopenThrew = true;
  }
  assert(reopenThrew, "reopenEventAction throws on a non-complete event");

  // Previewing works again now that the event is active (still within the
  // 3-round cap — only 2 are played). Leave the pending round in place and
  // end early anyway: the unconfirmed preview must be torn down, not orphaned.
  await previewNextRoundAction(event.id);
  const rePending = await getPendingRound(event.id);
  assert(rePending !== null, "preview works again after reopen");
  await endEventAction(event.id);
  const [reEnded] = await db
    .select()
    .from(events)
    .where(eq(events.id, event.id));
  assert(reEnded.status === "complete", "re-ending after reopen re-completes");
  assert(
    (await getPendingRound(event.id)) === null,
    "ending early tears down an unconfirmed pending round (no orphan)"
  );

  // Add a round: raises the cap past the originally scheduled count and reopens.
  const beforeTotal = reEnded.totalRounds;
  await addRoundAction(event.id);
  const [extended] = await db
    .select()
    .from(events)
    .where(eq(events.id, event.id));
  assert(extended.status === "active", "addRoundAction reopens the event");
  assert(
    extended.totalRounds === beforeTotal + 1,
    "addRoundAction raises totalRounds by one"
  );
  const clearedByAdd = await db
    .select({ finalStanding: eventPlayers.finalStanding })
    .from(eventPlayers)
    .where(eq(eventPlayers.eventId, event.id));
  assert(
    clearedByAdd.every((f) => f.finalStanding === null),
    "addRoundAction clears placements on reopen"
  );

  // The extra round is now previewable even though the original schedule was full.
  await previewNextRoundAction(event.id);
  const extraPending = await getPendingRound(event.id);
  assert(extraPending !== null, "extra round previewable after addRoundAction");
  await cancelPendingRoundAction(event.id);

  // addRoundAction refuses an event that isn't complete.
  let addThrew = false;
  try {
    await addRoundAction(event.id);
  } catch {
    addThrew = true;
  }
  assert(addThrew, "addRoundAction throws on a non-complete event");

  await cleanup();
  ok("post-clean end-early rows");
}

async function checkRoutes(
  eventId: string,
  sched?: { leagueSlug: string; pollId: string }
) {
  // Probe the server first; skip silently if it isn't running OR if something
  // unrelated is on the port. Look for "MTG Dash" in the response so a
  // foreign dev server on the same port doesn't produce false 404s.
  try {
    const res = await fetch(`http://localhost:${VERIFY_PORT}/`, {
      cache: "no-store",
    });
    if (!res.ok) {
      console.log(
        `  · http checks skipped (server returned ${res.status} on /)`
      );
      return;
    }
    const body = await res.text();
    if (!body.includes("MTG Dash")) {
      console.log(
        `  · http checks skipped (something else is on :${VERIFY_PORT}; not our app)`
      );
      return;
    }
  } catch {
    console.log(
      `  · http checks skipped (no server on :${VERIFY_PORT}; start one with npm run dev)`
    );
    return;
  }

  const leagueSlug = `${PREFIX}league`;
  const checks: { path: string; mustInclude?: string[] }[] = [
    { path: "/", mustInclude: ["MTG"] },
    {
      path: `/leagues/${leagueSlug}`,
      mustInclude: [`${PREFIX}League`, `${PREFIX}P1`],
    },
    {
      path: `/leagues/${leagueSlug}/claim`,
      mustInclude: ["Create wizard", `${PREFIX}P1`],
    },
    {
      path: `/leagues/${leagueSlug}/events/new`,
      mustInclude: ["Event name", "Players"],
    },
    {
      path: `/events/${eventId}/manage`,
      mustInclude: [`${PREFIX}P1`, "Standings"],
    },
    {
      path: `/events/${eventId}/broadcast`,
      mustInclude: [`${PREFIX}event`],
    },
    {
      path: `/events/${eventId}/claim`,
      mustInclude: [`${PREFIX}P1`, `${PREFIX}event`],
    },
    // Cookieless /play must land on the claim page, not a dead end.
    {
      path: `/events/${eventId}/play`,
      mustInclude: ["Tap your wizard to claim your seat"],
    },
    // A bad join token must redirect to the claim page with the notice.
    {
      path: `/events/${eventId}/join/bogus-token`,
      mustInclude: ["claim your seat below instead"],
    },
  ];

  if (sched) {
    checks.push(
      {
        path: `/leagues/${sched.leagueSlug}/schedule`,
        mustInclude: [`${PREFIX}poll`, "Propose dates"],
      },
      {
        path: `/leagues/${sched.leagueSlug}/schedule/new`,
        mustInclude: ["Propose draft nights"],
      },
      // The pass finalizes the poll, so the winner banner must render.
      {
        path: `/leagues/${sched.leagueSlug}/schedule/${sched.pollId}`,
        mustInclude: [`${PREFIX}poll`, "Draft night is set"],
      }
    );
  }

  for (const c of checks) {
    try {
      const res = await fetch(`http://localhost:${VERIFY_PORT}${c.path}`, {
        cache: "no-store",
      });
      if (res.status !== 200) {
        fail(`GET ${c.path} → ${res.status}`);
        continue;
      }
      if (c.mustInclude) {
        const body = await res.text();
        const missing = c.mustInclude.filter((m) => !body.includes(m));
        if (missing.length > 0) {
          fail(`GET ${c.path} missing: ${missing.join(", ")}`);
          continue;
        }
      }
      ok(`GET ${c.path} → 200`);
    } catch (e) {
      fail(`GET ${c.path} threw`, e);
    }
  }
}

/**
 * Walk-up self-join (addPlayerToEventRoster): a league player can grab a seat
 * in a draft event, re-joining is idempotent, and both the started-event and
 * wrong-league cases are rejected. Self-contained in its own `_verify_walkup`
 * league so it can't disturb the Swiss math of the main 8-player event.
 */
async function runWalkUpSelfJoinTest() {
  const [league] = await db
    .insert(leagues)
    .values({ slug: `${PREFIX}walkup`, name: `${PREFIX}WalkupLeague` })
    .returning();
  const [w1, w2, w3, w4] = await db
    .insert(players)
    .values(
      ["W1", "W2", "W3", "W4"].map((n) => ({
        leagueId: league.id,
        leagueToken: generateJoinToken(),
        displayName: `${PREFIX}${n}`,
      }))
    )
    .returning();
  const [event] = await db
    .insert(events)
    .values({
      leagueId: league.id,
      name: `${PREFIX}walkup_event`,
      totalRounds: 1,
      startingLife: 20,
    })
    .returning();
  await db.insert(eventPlayers).values(
    [w1, w2].map((p, i) => ({
      eventId: event.id,
      playerId: p.id,
      seed: i + 1,
      startingElo: p.currentElo,
      joinToken: generateJoinToken(),
    }))
  );

  const joined = await addPlayerToEventRoster({
    eventId: event.id,
    playerId: w3.id,
  });
  assert(!joined.alreadyJoined, "walk-up joins a draft event");
  const roster = await getEventRoster(event.id);
  assert(
    roster.length === 3 && roster.some((r) => r.playerId === w3.id),
    "roster includes the walk-up"
  );
  const [seat] = await db
    .select()
    .from(eventPlayers)
    .where(
      and(eq(eventPlayers.eventId, event.id), eq(eventPlayers.playerId, w3.id))
    );
  assert(seat.seed === 3, "walk-up gets the next seed");

  const rejoined = await addPlayerToEventRoster({
    eventId: event.id,
    playerId: w3.id,
  });
  assert(
    rejoined.alreadyJoined && rejoined.joinToken === joined.joinToken,
    "re-join is idempotent and returns the same seat"
  );

  await startNextRoundAction(event.id);
  let threwStarted = false;
  try {
    await addPlayerToEventRoster({ eventId: event.id, playerId: w4.id });
  } catch {
    threwStarted = true;
  }
  assert(threwStarted, "join rejected once the event has started");

  const [otherLeague] = await db
    .insert(leagues)
    .values({ slug: `${PREFIX}walkup2`, name: `${PREFIX}Walkup2` })
    .returning();
  const [stranger] = await db
    .insert(players)
    .values({
      leagueId: otherLeague.id,
      leagueToken: generateJoinToken(),
      displayName: `${PREFIX}Stranger`,
    })
    .returning();
  let threwLeague = false;
  try {
    await addPlayerToEventRoster({
      eventId: event.id,
      playerId: stranger.id,
    });
  } catch {
    threwLeague = true;
  }
  assert(threwLeague, "join rejected for a player from another league");
}

/**
 * Doodle-style date polls: create (with validation + date dedupe), vote,
 * re-vote (upsert), finalize, and the closed/foreign-player guards.
 * Self-contained in its own `_verify_sched` league. Returns the poll
 * coordinates so checkRoutes can probe the schedule pages.
 */
async function runSchedulingPollPass(): Promise<{
  leagueSlug: string;
  pollId: string;
}> {
  const [league] = await db
    .insert(leagues)
    .values({ slug: `${PREFIX}sched`, name: `${PREFIX}SchedLeague` })
    .returning();
  const [s1, s2, s3] = await db
    .insert(players)
    .values(
      ["S1", "S2", "S3"].map((n) => ({
        leagueId: league.id,
        leagueToken: generateJoinToken(),
        displayName: `${PREFIX}${n}`,
      }))
    )
    .returning();

  try {
    await createDatePollAction(
      makeFormData({
        leagueId: league.id,
        playerId: s1.id,
        title: `${PREFIX}poll`,
        optionDate: "2026-07-17T19:00",
      })
    );
    fail("poll with a single date should throw");
  } catch (e) {
    if (isNextRedirect(e)) fail("poll with a single date should throw");
    else ok("rejects a poll with fewer than 2 dates");
  }

  try {
    await createDatePollAction(
      makeFormData({
        leagueId: league.id,
        playerId: crypto.randomUUID(),
        title: `${PREFIX}poll`,
        optionDate: ["2026-07-17T19:00", "2026-07-18T19:00"],
      })
    );
    fail("poll from a non-league player should throw");
  } catch (e) {
    if (isNextRedirect(e)) fail("poll from a non-league player should throw");
    else ok("rejects a poll creator outside the league");
  }

  try {
    await createDatePollAction(
      makeFormData({
        leagueId: league.id,
        playerId: s1.id,
        title: `${PREFIX}poll`,
        optionDate: [
          "2026-07-17T19:00",
          "2026-07-18T19:00",
          "2026-07-18T19:00", // duplicate — must collapse
          "2026-07-24T19:00",
        ],
      })
    );
    fail("createDatePollAction should redirect on success");
  } catch (e) {
    if (isNextRedirect(e)) ok("poll created (redirects to the poll page)");
    else throw e;
  }

  const [poll] = await db
    .select()
    .from(datePolls)
    .where(eq(datePolls.leagueId, league.id));
  assert(poll && poll.status === "open", "poll row exists and is open");
  let options = await getPollDetail(poll.id);
  assert(options.length === 3, "duplicate candidate date collapsed (3 options)");
  const [o1, o2, o3] = options;

  await castPollVotesAction(
    makeFormData({
      pollId: poll.id,
      playerId: s1.id,
      [`response_${o1.id}`]: "yes",
      [`response_${o2.id}`]: "if_need_be",
      [`response_${o3.id}`]: "no",
    })
  );
  await castPollVotesAction(
    makeFormData({
      pollId: poll.id,
      playerId: s2.id,
      [`response_${o1.id}`]: "yes",
    })
  );
  await castPollVotesAction(
    makeFormData({
      pollId: poll.id,
      playerId: s3.id,
      [`response_${o1.id}`]: "no",
      [`response_${o2.id}`]: "yes",
    })
  );

  options = await getPollDetail(poll.id);
  const votesFor = (id: string) =>
    options.find((o) => o.id === id)!.votes;
  assert(votesFor(o1.id).length === 3, "option 1 has 3 votes");
  assert(
    votesFor(o1.id).filter((v) => v.response === "yes").length === 2,
    "option 1 tallies 2 yes"
  );
  const leading = pickLeadingOptionId(
    options.map((o) => ({
      id: o.id,
      startsAt: o.startsAt,
      responses: o.votes.map((v) => v.response),
    }))
  );
  assert(leading === o1.id, "option 1 leads (2 yes > 1 yes + 1 if-need-be)");

  // Re-vote: s2 flips option 1 to "no" — upsert must overwrite, not duplicate.
  await castPollVotesAction(
    makeFormData({
      pollId: poll.id,
      playerId: s2.id,
      [`response_${o1.id}`]: "no",
    })
  );
  options = await getPollDetail(poll.id);
  assert(votesFor(o1.id).length === 3, "re-vote did not add a duplicate row");
  assert(
    votesFor(o1.id).find((v) => v.playerId === s2.id)?.response === "no",
    "re-vote overwrote the response"
  );
  const newLeading = pickLeadingOptionId(
    options.map((o) => ({
      id: o.id,
      startsAt: o.startsAt,
      responses: o.votes.map((v) => v.response),
    }))
  );
  assert(newLeading === o2.id, "lead moves to option 2 after the flip");

  try {
    await castPollVotesAction(
      makeFormData({ pollId: poll.id, playerId: s1.id })
    );
    fail("vote with no responses should throw");
  } catch {
    ok("rejects a vote with no responses");
  }

  try {
    await castPollVotesAction(
      makeFormData({
        pollId: poll.id,
        playerId: crypto.randomUUID(),
        [`response_${o1.id}`]: "yes",
      })
    );
    fail("vote from a non-league player should throw");
  } catch {
    ok("rejects a voter outside the league");
  }

  try {
    await finalizeDatePollAction(
      makeFormData({
        pollId: poll.id,
        playerId: s1.id,
        optionId: crypto.randomUUID(),
      })
    );
    fail("finalizing a foreign option should throw");
  } catch {
    ok("rejects finalizing an option not in the poll");
  }

  await finalizeDatePollAction(
    makeFormData({ pollId: poll.id, playerId: s1.id, optionId: o2.id })
  );
  const finalized = await getDatePoll(poll.id);
  assert(finalized?.status === "finalized", "poll marked finalized");
  assert(
    finalized?.finalizedOptionId === o2.id,
    "winning option recorded"
  );

  try {
    await castPollVotesAction(
      makeFormData({
        pollId: poll.id,
        playerId: s1.id,
        [`response_${o1.id}`]: "yes",
      })
    );
    fail("voting on a finalized poll should throw");
  } catch {
    ok("rejects votes once the poll is finalized");
  }

  return { leagueSlug: league.slug, pollId: poll.id };
}

async function main() {
  const start = Date.now();
  console.log("=== verify ===\n");

  await cleanup();
  ok("pre-clean leftover _verify_ rows");

  const { event, league, players: testPlayers } = await setupEvent(8);
  ok(`set up 8-player event ${event.id.slice(0, 8)} in league ${league.slug}`);

  await driveRound1ViaPhones(event.id);
  ok("round 1 — game-by-game flow + life adjust");

  await driveRound2WithOverridesAndDraw(event.id);
  ok("round 2 — organizer overrides incl. a draw");

  await driveRound3WithPrematureEnd(event.id);
  ok("round 3 — premature complete throws, then succeeds");

  await runWalkUpSelfJoinTest();
  ok("walk-up self-join — draft joins, idempotency, started/league guards");

  const sched = await runSchedulingPollPass();
  ok("scheduling poll — create, vote, re-vote upsert, finalize, guards");

  // === invariants ===
  const standings = await getEventStandings(event.id);
  assert(
    standings.length === testPlayers.length,
    `standings list contains all ${testPlayers.length} players`
  );

  const [final] = await db.select().from(events).where(eq(events.id, event.id));
  assert(final.status === "complete", "event auto-marked complete");

  // No rematches for any player.
  const rematches = standings.filter(
    (s) => s.opponentsFaced.length !== new Set(s.opponentsFaced).size
  );
  assert(rematches.length === 0, "no rematches across the event");

  // Each player faced 3 unique opponents (8p × 3 rounds, no byes).
  assert(
    standings.every((s) => s.opponentsFaced.length === 3),
    "each player faced 3 opponents"
  );

  // Decisive matches updated ELO; draws should leave it alone. Quick sanity:
  // draws don't write elo_changes, but at least one player should have ≠1200.
  const movedElo = standings.filter((s) => s.currentElo !== 1200).length;
  assert(movedElo > 0, "ELO ratings changed for at least one player");

  // Standings sorted by MTG tiebreakers: MP > OMW% > GW% > OGW% > ELO.
  for (let i = 1; i < standings.length; i++) {
    const prev = standings[i - 1];
    const cur = standings[i];
    const order =
      prev.matchPoints > cur.matchPoints
        ? true
        : prev.matchPoints < cur.matchPoints
          ? false
          : prev.opponentMatchWinPct > cur.opponentMatchWinPct
            ? true
            : prev.opponentMatchWinPct < cur.opponentMatchWinPct
              ? false
              : prev.gameWinPct > cur.gameWinPct
                ? true
                : prev.gameWinPct < cur.gameWinPct
                  ? false
                  : prev.opponentGameWinPct > cur.opponentGameWinPct
                    ? true
                    : prev.opponentGameWinPct < cur.opponentGameWinPct
                      ? false
                      : prev.currentElo >= cur.currentElo;
    assert(order, `standings ordering: row ${i - 1} ≥ row ${i} (MTG tiebreakers)`);
  }

  // Tiebreaker fields are populated and within [0, 1].
  for (const s of standings) {
    assert(
      s.opponentMatchWinPct >= 0 && s.opponentMatchWinPct <= 1,
      `${s.displayName}: OMW% in [0,1]`
    );
    assert(
      s.gameWinPct >= 0 && s.gameWinPct <= 1,
      `${s.displayName}: GW% in [0,1]`
    );
    assert(
      s.opponentGameWinPct >= 0 && s.opponentGameWinPct <= 1,
      `${s.displayName}: OGW% in [0,1]`
    );
    assert(
      s.gameWins > 0 || s.matchPoints === 0,
      `${s.displayName}: gameWins > 0 if any match was won`
    );
  }

  await checkRoutes(event.id, sched);

  // FLUX-backed wizardize: ~90s when the image-gen server is up. Run it on
  // the first test player so the avatar columns also get exercised.
  await runWizardizeIntegrationTest(testPlayers[0].id);

  await runSixPlayerSwissPass();
  await runReviewFlowPass();
  await runEndEarlyPass();

  await cleanup();
  ok("post-clean test rows");

  // Verify cleanup didn't miss anything.
  const stragglerLeagues = await db
    .select()
    .from(leagues)
    .where(like(leagues.slug, `${PREFIX}%`));
  const stragglerEvents = await db
    .select()
    .from(events)
    .where(like(events.name, `${PREFIX}%`));
  const stragglerPlayers = await db
    .select()
    .from(players)
    .where(like(players.displayName, `${PREFIX}%`));
  assert(stragglerLeagues.length === 0, "no leftover verify leagues");
  assert(stragglerEvents.length === 0, "no leftover verify events");
  assert(stragglerPlayers.length === 0, "no leftover verify players");

  const ms = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  ${okCount} ok, ${failCount} fail   (${ms}s)`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n💥 verify aborted:");
  console.error(err);
  // best-effort cleanup before exiting
  cleanup()
    .catch(() => undefined)
    .finally(() => process.exit(1));
});
