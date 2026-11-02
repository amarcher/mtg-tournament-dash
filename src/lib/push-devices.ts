import { and, countDistinct, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { players, pushDevicePlayers, pushDevices } from "@/db/schema";
import { isPlausibleToken, type PushPlatform } from "@/lib/push-rules";

/**
 * Device-row bookkeeping for push, deliberately free of cookies and authz so
 * the verify harness can drive it with explicit player ids (the same split
 * as match-mutations.ts). The server actions resolve the caller's players
 * from the league cookies and call in here.
 */

export type PushPrefs = {
  notifyRounds: boolean;
  notifySchedule: boolean;
  notifyMessages: boolean;
};

/**
 * Upsert the device by token and link it to every player the phone speaks
 * for. Re-run on every app launch: it refreshes `last_seen_at`, revives a
 * row a store had marked failed, and picks up leagues claimed since.
 */
export async function registerPushDevice(input: {
  token: string;
  platform: PushPlatform;
  appBuild?: string | null;
  playerIds: string[];
}) {
  if (!isPlausibleToken(input.token)) throw new Error("Bad device token");
  const [device] = await db
    .insert(pushDevices)
    .values({
      token: input.token,
      platform: input.platform,
      appBuild: input.appBuild ?? null,
    })
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: {
        platform: input.platform,
        appBuild: input.appBuild ?? null,
        lastSeenAt: new Date(),
        failedAt: null,
      },
    })
    .returning();

  const playerIds = [...new Set(input.playerIds)];
  if (playerIds.length > 0) {
    await db
      .insert(pushDevicePlayers)
      .values(playerIds.map((playerId) => ({ deviceId: device.id, playerId })))
      .onConflictDoNothing();
  }
  return device;
}

export async function getPushDeviceByToken(token: string) {
  const [device] = await db
    .select()
    .from(pushDevices)
    .where(eq(pushDevices.token, token));
  return device ?? null;
}

export async function updatePushDevicePrefs(
  token: string,
  patch: Partial<PushPrefs>
) {
  const [device] = await db
    .update(pushDevices)
    .set({ ...patch, lastSeenAt: new Date() })
    .where(eq(pushDevices.token, token))
    .returning();
  return device ?? null;
}

/** "Turn everything off" or an uninstall the store told us about. */
export async function removePushDevice(token: string) {
  await db.delete(pushDevices).where(eq(pushDevices.token, token));
}

export type RecipientDevice = {
  deviceId: string;
  token: string;
  platform: PushPlatform;
  notifyRounds: boolean;
  notifySchedule: boolean;
  notifyMessages: boolean;
  playerId: string;
};

/** Every live device linked to any of these players, one row per (device, player). */
export async function listDevicesForPlayers(
  playerIds: string[]
): Promise<RecipientDevice[]> {
  if (playerIds.length === 0) return [];
  return db
    .select({
      deviceId: pushDevices.id,
      token: pushDevices.token,
      platform: pushDevices.platform,
      notifyRounds: pushDevices.notifyRounds,
      notifySchedule: pushDevices.notifySchedule,
      notifyMessages: pushDevices.notifyMessages,
      playerId: pushDevicePlayers.playerId,
    })
    .from(pushDevicePlayers)
    .innerJoin(pushDevices, eq(pushDevices.id, pushDevicePlayers.deviceId))
    .where(
      and(
        inArray(pushDevicePlayers.playerId, playerIds),
        isNull(pushDevices.failedAt)
      )
    );
}

/** Player ids in a league, optionally leaving one out (the poll's author). */
export async function listLeaguePlayerIds(
  leagueId: string,
  except?: string | null
): Promise<string[]> {
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.leagueId, leagueId));
  return rows.map((r) => r.id).filter((id) => id !== except);
}

/**
 * How far an organizer's note would reach: live phones linked to the
 * league with the messages switch on, and the players they cover. Shown on
 * the composer so "sent to 0 phones" is never a surprise.
 */
export async function countMessageReach(leagueId: string) {
  const [row] = await db
    .select({
      phones: countDistinct(pushDevices.id),
      players: countDistinct(pushDevicePlayers.playerId),
    })
    .from(pushDevicePlayers)
    .innerJoin(pushDevices, eq(pushDevices.id, pushDevicePlayers.deviceId))
    .innerJoin(players, eq(players.id, pushDevicePlayers.playerId))
    .where(
      and(
        eq(players.leagueId, leagueId),
        isNull(pushDevices.failedAt),
        eq(pushDevices.notifyMessages, true)
      )
    );
  return { phones: row?.phones ?? 0, players: row?.players ?? 0 };
}
