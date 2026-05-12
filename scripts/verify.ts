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

import { eq, like } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../src/db/client";
import { events, eventPlayers, leagues, players } from "../src/db/schema";
import {
  startNextRoundAction,
  reportGameWinnerAction,
  completeRoundAction,
  setMatchResultAction,
  adjustLifeAction,
  generateWizardAction,
} from "../src/app/events/actions";
import { generateJoinToken } from "../src/lib/auth";
import {
  getCurrentRound,
  getEventRounds,
  getEventStandings,
  getRoundMatches,
} from "../src/db/queries";

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

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

async function driveRound1ViaPhones(eventId: string) {
  await startNextRoundAction(eventId);
  const round = await getCurrentRound(eventId);
  assert(round, "round 1 active after startNextRoundAction");
  const ms = await getRoundMatches(round!.id);

  // Exercise the life-adjust path on table 1 before reporting.
  const t1 = ms.find((m) => m.playerB);
  if (t1) {
    const before = await adjustLifeAction({
      matchId: t1.match.id,
      side: "a",
      delta: -3,
    });
    assert(before.life === 17, "adjustLifeAction returns new life total");
  }

  for (const { match, playerA, playerB } of ms) {
    if (!playerB) continue;
    const winner =
      playerA.displayName < playerB.displayName ? playerA : playerB;
    await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
    await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
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
 * End-to-end wizardize: drive `generateWizardAction` against the local FLUX
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
  const fd = new FormData();
  fd.set("playerId", playerId);
  fd.set("archetype", "frost mage");
  fd.set("freeform", "");
  fd.set(
    "selfie",
    new File([new Uint8Array(selfieBytes)], "test-selfie.jpg", {
      type: "image/jpeg",
    })
  );
  await generateWizardAction(fd);
  // Action now returns immediately and runs FLUX in the background. Poll the
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
  ok(`generateWizardAction completed end-to-end against FLUX (${elapsed}s)`);
  assert(
    row.avatarUrl?.includes(`wizard-${playerId}-fresh.jpg`),
    "fresh URL written to players.avatar_url"
  );
  assert(
    row.avatarWoundedUrl?.includes(`wizard-${playerId}-wounded.jpg`),
    "wounded URL written to players.avatar_wounded_url"
  );
  assert(
    row.avatarCriticalUrl?.includes(`wizard-${playerId}-critical.jpg`),
    "critical URL written to players.avatar_critical_url"
  );
  assert(
    row.avatarVictoryUrl?.includes(`wizard-${playerId}-victory.jpg`),
    "victory URL written to players.avatar_victory_url"
  );
  assert(
    row.avatarDefeatUrl?.includes(`wizard-${playerId}-defeat.jpg`),
    "defeat URL written to players.avatar_defeat_url"
  );
  assert(
    row.selfieUrl?.includes(`selfie-${playerId}.jpg`),
    "selfie URL persisted"
  );
  assert(row.wizardArchetype === "frost mage", "wizardArchetype persisted");
  assert(row.avatarUrl?.startsWith("/files/"), "URLs point at /files/");
  assert(row.avatarUrl?.includes("?v="), "fresh URL has cache-buster");

  // Each variant on the image-gen server should be a real JPEG, not a 0-byte
  // error response. Probe via the public /files endpoint.
  for (const tier of ["fresh", "wounded", "critical", "victory", "defeat"] as const) {
    const name = `wizard-${playerId}-${tier}.jpg`;
    const res = await fetch(`${fluxUrl}/files/${name}`);
    if (!res.ok) {
      fail(`/files/${name} GET → ${res.status}`);
      continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    assert(
      bytes.length > 50_000,
      `${tier} variant > 50KB on image-gen (${bytes.length} B)`
    );
  }

  // Clean up uploaded files via the DELETE endpoint.
  const token = process.env.IMAGEGEN_FILES_TOKEN ?? "";
  for (const tier of [
    "fresh",
    "wounded",
    "critical",
    "victory",
    "defeat",
  ] as const) {
    await fetch(`${fluxUrl}/files/wizard-${playerId}-${tier}.jpg`, {
      method: "DELETE",
      headers: { "X-Files-Token": token },
    }).catch(() => undefined);
  }
  await fetch(`${fluxUrl}/files/selfie-${playerId}.jpg`, {
    method: "DELETE",
    headers: { "X-Files-Token": token },
  }).catch(() => undefined);
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
    await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
    await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
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
    await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
    await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
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
    await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
    await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
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
  await cleanup();
  ok("post-clean 6-player rows");
}

async function checkRoutes(eventId: string) {
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
  ];

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

  await checkRoutes(event.id);

  // FLUX-backed wizardize: ~90s when the image-gen server is up. Run it on
  // the first test player so the avatar columns also get exercised.
  await runWizardizeIntegrationTest(testPlayers[0].id);

  await runSixPlayerSwissPass();

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
