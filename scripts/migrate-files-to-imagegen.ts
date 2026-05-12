/**
 * Migrate generated images from local /public to the image-gen /files endpoint
 * and rewrite the matching DB URL columns. One-shot; safe to re-run.
 *
 *   npm run migrate:files
 *
 * - Selfies: /selfies/<uuid>.jpg → /files/selfie-<uuid>.jpg
 * - Wizards: /wizards/<uuid>-<tier>.jpg → /files/wizard-<uuid>-<tier>.jpg
 *
 * Files are uploaded to image-gen with `?v=<timestamp>` cache busters
 * preserved. Already-migrated rows (URLs starting with `/files/`) are skipped.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { players } from "../src/db/schema";

const IMAGEGEN_URL = process.env.IMAGEGEN_URL ?? "http://127.0.0.1:8000";
const TOKEN = process.env.IMAGEGEN_FILES_TOKEN;
const PUBLIC_DIR = join(process.cwd(), "public");

if (!TOKEN) {
  console.error("IMAGEGEN_FILES_TOKEN not set in .env.local");
  process.exit(1);
}

async function upload(name: string, path: string): Promise<void> {
  const buf = await readFile(path);
  const res = await fetch(`${IMAGEGEN_URL}/files/${name}`, {
    method: "PUT",
    headers: {
      "X-Files-Token": TOKEN!,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(buf),
  });
  if (!res.ok) {
    throw new Error(
      `upload ${name} failed: ${res.status} ${await res.text().catch(() => "")}`
    );
  }
}

function rewrite(url: string | null, prefix: string, newPrefix: string): string | null {
  if (!url) return url;
  if (url.startsWith("/files/")) return url; // already migrated
  if (!url.startsWith(prefix)) return url;
  const trimmed = url.slice(prefix.length);
  return `/files/${newPrefix}${trimmed}`;
}

async function main() {
  const all = await db.select().from(players);
  console.log(`${all.length} players to inspect`);

  let uploaded = 0;
  let skipped = 0;

  for (const p of all) {
    const updates: Partial<typeof players.$inferInsert> = {};

    type Mapping = {
      column: "selfieUrl" | "avatarUrl" | "avatarWoundedUrl" | "avatarCriticalUrl";
      oldPrefix: string;
      newPrefix: string;
      filesDir: "selfies" | "wizards";
    };
    const mappings: Mapping[] = [
      { column: "selfieUrl", oldPrefix: "/selfies/", newPrefix: "selfie-", filesDir: "selfies" },
      { column: "avatarUrl", oldPrefix: "/wizards/", newPrefix: "wizard-", filesDir: "wizards" },
      { column: "avatarWoundedUrl", oldPrefix: "/wizards/", newPrefix: "wizard-", filesDir: "wizards" },
      { column: "avatarCriticalUrl", oldPrefix: "/wizards/", newPrefix: "wizard-", filesDir: "wizards" },
    ];

    for (const m of mappings) {
      const url = p[m.column];
      if (!url || url.startsWith("/files/")) continue;
      if (!url.startsWith(m.oldPrefix)) continue;

      const [pathOnly] = url.split("?");
      const filename = pathOnly.slice(m.oldPrefix.length);
      const localPath = join(PUBLIC_DIR, m.filesDir, filename);
      if (!existsSync(localPath)) {
        console.log(`  skip ${p.displayName}/${m.column}: file not on disk (${filename})`);
        skipped++;
        continue;
      }
      const newName = `${m.newPrefix}${filename}`;
      await upload(newName, localPath);
      const rewritten = rewrite(url, m.oldPrefix, m.newPrefix)!;
      updates[m.column] = rewritten;
      uploaded++;
      console.log(`  ${p.displayName}: ${url} → ${rewritten}`);
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(players)
        .set({
          ...updates,
          // touch updatedAt-equivalent — we don't have one, but a no-op set
          // keeps drizzle happy when only some columns change.
          currentElo: sql`${players.currentElo}`,
        })
        .where(eq(players.id, p.id));
    }
  }

  console.log(`\n${uploaded} files uploaded, ${skipped} skipped`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
