import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const r = await sql`DELETE FROM events WHERE status = 'active' RETURNING id`;
  console.log(`deleted ${r.length} stuck event(s)`);
}
main();
