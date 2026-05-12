import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { and, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { leagues, players } from "./schema";
import { generateJoinToken } from "@/lib/auth";

const DEMO_NAMES = ["Andrew", "Casey", "Devon", "Jordan", "Morgan", "Sam"];

async function ensureLeague(slug: string, name: string) {
  const [existing] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.slug, slug));
  if (existing) return existing;
  const [created] = await db
    .insert(leagues)
    .values({ slug, name })
    .returning();
  return created;
}

async function main() {
  const demo = await ensureLeague("demo", "Demo League");
  const lex = await ensureLeague(
    "lexington-dads-magic-draft",
    "Lexington Dads Magic Draft"
  );
  console.log(`✓ league: ${demo.slug}`);
  console.log(`✓ league: ${lex.slug}`);

  const existingDemoPlayers = await db
    .select({ displayName: players.displayName })
    .from(players)
    .where(
      and(
        eq(players.leagueId, demo.id),
        inArray(players.displayName, DEMO_NAMES)
      )
    );
  const have = new Set(existingDemoPlayers.map((p) => p.displayName));
  const missing = DEMO_NAMES.filter((n) => !have.has(n));

  if (missing.length === 0) {
    console.log("✓ demo roster already seeded");
    return;
  }

  const inserted = await db
    .insert(players)
    .values(
      missing.map((displayName) => ({
        leagueId: demo.id,
        leagueToken: generateJoinToken(),
        displayName,
      }))
    )
    .returning();
  console.log(`✓ inserted ${inserted.length} demo players`);
  for (const p of inserted) console.log(`  ${p.id}  ${p.displayName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
