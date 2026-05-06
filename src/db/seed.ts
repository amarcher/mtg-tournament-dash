import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "./client";
import { players } from "./schema";

const NAMES = ["Andrew", "Casey", "Devon", "Jordan", "Morgan", "Sam"];

async function main() {
  console.log("seeding players…");
  const inserted = await db
    .insert(players)
    .values(NAMES.map((displayName) => ({ displayName })))
    .returning();
  console.log(`✓ inserted ${inserted.length} players`);
  for (const p of inserted) console.log(`  ${p.id}  ${p.displayName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
