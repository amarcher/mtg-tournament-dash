import type { Player } from "@/db/schema";

/**
 * What a scorekeeper client component may know about a player. A full
 * `players` row must never be a client prop: props are serialized into the
 * page, and the row carries `league_token`, which is the player's identity.
 */
export type TablePlayer = Pick<
  Player,
  | "id"
  | "displayName"
  | "avatarUrl"
  | "avatarWoundedUrl"
  | "avatarCriticalUrl"
  | "avatarVictoryUrl"
  | "avatarDefeatUrl"
>;

export function toTablePlayer(p: Player): TablePlayer {
  return {
    id: p.id,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    avatarWoundedUrl: p.avatarWoundedUrl,
    avatarCriticalUrl: p.avatarCriticalUrl,
    avatarVictoryUrl: p.avatarVictoryUrl,
    avatarDefeatUrl: p.avatarDefeatUrl,
  };
}
