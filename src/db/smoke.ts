import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { eq } from "drizzle-orm";
import { db } from "./client";
import { events, eventPlayers, players } from "./schema";
import {
  startNextRoundAction,
  reportGameWinnerAction,
  completeRoundAction,
} from "../app/events/actions";
import { generateJoinToken } from "../lib/auth";
import {
  getCurrentRound,
  getRoundMatches,
  getEventStandings,
} from "./queries";

async function main() {
  console.log("=== smoke test: full 3-round event ===\n");

  const allPlayers = await db.select().from(players);
  if (allPlayers.length < 6) {
    throw new Error("need ≥6 seeded players (run pnpm db:seed)");
  }
  const six = allPlayers.slice(0, 6);
  const leagueId = six[0].leagueId;

  // Create event directly in DB (bypassing the server action since it calls
  // redirect() which throws outside a request scope).
  const [event] = await db
    .insert(events)
    .values({
      leagueId,
      name: "Smoke Test Cup",
      totalRounds: 3,
      startingLife: 20,
    })
    .returning();
  console.log(`event:  ${event.id}  ${event.name}`);

  await db.insert(eventPlayers).values(
    six.map((p, i) => ({
      eventId: event.id,
      playerId: p.id,
      seed: i + 1,
      startingElo: p.currentElo,
      joinToken: generateJoinToken(),
    }))
  );

  for (let r = 1; r <= 3; r++) {
    console.log(`\n--- round ${r} ---`);
    await startNextRoundAction(event.id);
    const round = await getCurrentRound(event.id);
    if (!round) throw new Error("no active round after start");
    const ms = await getRoundMatches(round.id);
    for (const { match, playerA, playerB } of ms) {
      if (!playerB) {
        console.log(`  T${match.tableNumber}: ${playerA.displayName} BYE`);
        continue;
      }
      // Best-of-three: alphabetically earlier name wins games 1 and 2.
      const winner = playerA.displayName < playerB.displayName ? playerA : playerB;
      await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
      await reportGameWinnerAction({ matchId: match.id, winnerId: winner.id });
      console.log(
        `  T${match.tableNumber}: ${playerA.displayName} vs ${playerB.displayName} → ${winner.displayName} wins 2-0`
      );
    }
    await completeRoundAction(event.id);
  }

  console.log("\n=== final standings ===");
  const standings = await getEventStandings(event.id);
  for (const [i, s] of standings.entries()) {
    console.log(
      `  ${i + 1}. ${s.displayName.padEnd(8)} ${s.wins}-${s.losses}-${s.draws}  pts=${s.matchPoints}  elo=${s.currentElo}`
    );
  }

  // Check that all 3-round invariants hold.
  console.log("\n=== invariants ===");
  const ev = await db.select().from(events).where(eq(events.id, event.id));
  console.log(`  event status: ${ev[0].status}  (expected: complete)`);

  // Verify no rematches.
  const rematches = new Map<string, number>();
  for (const s of standings) {
    const key = s.playerId;
    rematches.set(
      key,
      s.opponentsFaced.length === new Set(s.opponentsFaced).size ? 0 : 1
    );
  }
  const totalRematches = Array.from(rematches.values()).reduce(
    (a, b) => a + b,
    0
  );
  console.log(`  rematches: ${totalRematches}  (expected: 0)`);
  console.log(
    `  each player faced 3 opponents: ${standings.every((s) => s.opponentsFaced.length === 3) ? "✓" : "✗"}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
