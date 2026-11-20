import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventPlayers, players, pushDevicePlayers } from "@/db/schema";
import { generateJoinToken } from "@/lib/auth";

/**
 * Ownership writes, free of cookies and sessions so the verify harness can
 * drive them with explicit ids (the same split as push-devices.ts). The
 * actions decide whether a claim is allowed (wizard-ownership.ts) and then
 * call in here.
 */

export function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) =>
    typeof x === "object" && x !== null && "code" in x
      ? (x as { code: unknown }).code
      : null;
  return code(e) === "23505" || code((e as { cause?: unknown })?.cause) === "23505";
}

/**
 * Whenever a wizard changes hands its tokens are replaced and its phones are
 * unlinked, so no cookie, join link, resume link or push registration from
 * before the change still reaches it. Without this, releasing a wizard would
 * hand it back to every phone that ever held it. The new owner is found by
 * session, and a phone still entitled to it re-registers on its next launch.
 */
async function cutOldAccess(playerId: string) {
  await Promise.all([
    // One statement for every seat, each needing its own value: two random
    // UUIDs are 244 bits, more than generateJoinToken's 192.
    db
      .update(eventPlayers)
      .set({
        joinToken: sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`,
      })
      .where(eq(eventPlayers.playerId, playerId)),
    db.delete(pushDevicePlayers).where(eq(pushDevicePlayers.playerId, playerId)),
  ]);
}

export type TakeResult = "taken" | "already_mine" | "owned_by_other" | "has_wizard";

/**
 * Make an unowned wizard this account's. The guard on `user_id` settles two
 * phones racing for one wizard, and the unique (league, user) index settles
 * one account racing for two; any other failure is a real error and throws.
 */
export async function takeWizard(
  playerId: string,
  userId: string
): Promise<TakeResult> {
  let rows: { id: string }[];
  try {
    rows = await db
      .update(players)
      .set({ userId, leagueToken: generateJoinToken() })
      .where(and(eq(players.id, playerId), isNull(players.userId)))
      .returning({ id: players.id });
  } catch (e) {
    if (isUniqueViolation(e)) return "has_wizard";
    throw e;
  }
  if (rows.length === 1) {
    await cutOldAccess(playerId);
    return "taken";
  }
  const [now] = await db
    .select({ userId: players.userId })
    .from(players)
    .where(eq(players.id, playerId));
  return now?.userId === userId ? "already_mine" : "owned_by_other";
}

/** Make a wizard unowned again (a wrong claim, a departed member, a lost phone). */
export async function releaseWizard(playerId: string) {
  await db
    .update(players)
    .set({ userId: null, leagueToken: generateJoinToken() })
    .where(eq(players.id, playerId));
  await cutOldAccess(playerId);
}
