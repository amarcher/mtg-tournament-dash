import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT id, name, status FROM events ORDER BY created_at DESC LIMIT 10`;
  for (const r of rows) console.log(`${r.id}  ${r.status.padEnd(10)} ${r.name}`);
}
main();
