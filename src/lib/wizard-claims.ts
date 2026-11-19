import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { players } from "@/db/schema";

/**
 * Ownership writes, free of cookies and sessions so the verify harness can
 * drive them with explicit ids (the same split as push-devices.ts). The
 * actions decide whether a claim is allowed (wizard-ownership.ts) and then
 * call in here.
 */

/**
 * Make an unowned wizard this account's. False when it was taken first or
 * the account already owns a wizard in the league: the guard on `user_id`
 * and the unique (league, user) index settle a race between two phones.
 */
export async function takeWizard(playerId: string, userId: string): Promise<boolean> {
  try {
    const rows = await db
      .update(players)
      .set({ userId })
      .where(and(eq(players.id, playerId), isNull(players.userId)))
      .returning({ id: players.id });
    return rows.length === 1;
  } catch {
    return false;
  }
}

/** Organizer: make a wizard unowned again (a wrong claim, or a departed member). */
export async function releaseWizard(playerId: string) {
  await db.update(players).set({ userId: null }).where(eq(players.id, playerId));
}
