/**
 * Migrate `/files/<name>` portraits to Vercel Blob, with stable per-(player,
 * tier) keys, and rewrite the DB columns. One-shot; safe to re-run.
 *
 *   npm run migrate:blob
 *
 * For each players row, looks at six URL columns:
 *   - selfieUrl, avatarUrl, avatarWoundedUrl, avatarCriticalUrl,
 *     avatarVictoryUrl, avatarDefeatUrl
 *
 * If a column's value starts with `/files/`, downloads via the local Next.js
 * proxy (so the script doesn't need image-gen tokens), `put()`s to Blob
 * under `avatars/<playerId>/{tier}.jpg`, and updates the column to the new
 * Blob URL with a fresh ?v= cache buster. Already-migrated rows (URLs that
 * are already absolute https://) are skipped.
 *
 * Requires:
 *   - BLOB_READ_WRITE_TOKEN in .env.local (set by `vercel blob create-store`)
 *   - A reachable Next.js proxy at PUBLIC_URL or 127.0.0.1:3002
 *     (defaults to local; the image-gen server must be up).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { players } from "../src/db/schema";

const PROXY_BASE = process.env.MIGRATE_PROXY_BASE ?? "http://127.0.0.1:3002";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN not set in .env.local");
  process.exit(1);
}

type Tier = "selfie" | "fresh" | "wounded" | "critical" | "victory" | "defeat";

const COLUMNS: ReadonlyArray<{
  tier: Tier;
  field: keyof typeof players.$inferSelect;
}> = [
  { tier: "selfie", field: "selfieUrl" },
  { tier: "fresh", field: "avatarUrl" },
  { tier: "wounded", field: "avatarWoundedUrl" },
  { tier: "critical", field: "avatarCriticalUrl" },
  { tier: "victory", field: "avatarVictoryUrl" },
  { tier: "defeat", field: "avatarDefeatUrl" },
];

async function fetchLegacy(legacyPath: string): Promise<Buffer> {
  // legacyPath looks like `/files/wizard-<id>-victory.jpg?v=<ts>` — strip the
  // query string when building the URL since the proxy doesn't care about it,
  // and we'll add a fresh cache buster when we write to Blob.
  const url = new URL(legacyPath.split("?")[0], PROXY_BASE).toString();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const rows = await db.select().from(players);
  console.log(`scanning ${rows.length} players`);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const updates: Partial<typeof players.$inferInsert> = {};

    for (const { tier, field } of COLUMNS) {
      const value = row[field] as string | null | undefined;
      if (!value) continue;
      if (!value.startsWith("/files/")) {
        skipped++;
        continue;
      }
      try {
        const buf = await fetchLegacy(value);
        const result = await put(
          `avatars/${row.id}/${tier}.jpg`,
          buf,
          {
            access: "public",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "image/jpeg",
          }
        );
        const newUrl = `${result.url}?v=${Date.now()}`;
        (updates as Record<string, string>)[field as string] = newUrl;
        console.log(`  ${row.displayName} :: ${tier} → ${result.url}`);
        migrated++;
      } catch (err) {
        console.error(
          `  ${row.displayName} :: ${tier} FAILED — ${(err as Error).message}`
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.update(players).set(updates).where(eq(players.id, row.id));
    }
  }

  console.log(`\ndone: migrated=${migrated} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
