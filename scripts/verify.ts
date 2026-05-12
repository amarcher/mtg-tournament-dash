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

  // Standings sorted by match points then ELO.
  for (let i = 1; i < standings.length; i++) {
    const prev = standings[i - 1];
    const cur = standings[i];
    assert(
      prev.matchPoints > cur.matchPoints ||
        (prev.matchPoints === cur.matchPoints && prev.currentElo >= cur.currentElo),
      `standings ordering: row ${i - 1} ≥ row ${i}`
    );
  }

  await checkRoutes(event.id);

  // FLUX-backed wizardize: ~90s when the image-gen server is up. Run it on
  // the first test player so the avatar columns also get exercised.
  await runWizardizeIntegrationTest(testPlayers[0].id);

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
