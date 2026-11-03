import type { AvatarTiers } from "./avatar-tier";

/**
 * Who to show in the bonus-game opponent picker, and in what order. Pure:
 * the pages fetch the league's players, the ongoing event's roster, the
 * league's match history and the busy set, and this module turns them into
 * one ranked list. Keep it free of db / "use server" imports so the client
 * component and the unit tests can share it.
 */

export type BonusOpponentTier = 1 | 2 | 3 | 4;

/**
 * Why a wizard can't be challenged right now, if they can't: in an open
 * bonus game, or at a table in the ongoing event's current round.
 */
export type BonusOpponentStatus = "free" | "bonus_game" | "round_match";

export type BonusOpponent = {
  playerId: string;
  displayName: string;
  avatars: AvatarTiers;
  status: BonusOpponentStatus;
  /** The round they are playing when status is "round_match". */
  roundNumber: number | null;
  tier: BonusOpponentTier;
  group: string;
};

export function isTiedUp(o: Pick<BonusOpponent, "status">): boolean {
  return o.status !== "free";
}

/** The short reason shown on a tied-up tile, or null when free. */
export function tiedUpLabel(
  o: Pick<BonusOpponent, "status" | "roundNumber">
): string | null {
  switch (o.status) {
    case "free":
      return null;
    case "bonus_game":
      return "bonus game";
    case "round_match":
      return o.roundNumber ? `round ${o.roundNumber}` : "round match";
  }
}

export const TIER_LABELS: Record<BonusOpponentTier, string> = {
  1: "In this event, free right now",
  2: "In this event, mid-match",
  3: "Played a bonus game lately",
  4: "Everyone else",
};

/** How long a bonus game keeps a wizard in the "played lately" group. */
export const RECENT_BONUS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** One row per match the league has hosted, bonus or tournament. */
export type LeagueMatchActivity = {
  playerAId: string;
  playerBId: string | null;
  /** Null = bonus game. */
  roundId: string | null;
  roundNumber: number | null;
  /** The tournament event (through the round); null for bonus games. */
  eventId: string | null;
  roundStatus: "pending" | "active" | "complete" | null;
  status: "pending" | "in_progress" | "complete";
  createdAt: Date;
  completedAt: Date | null;
};

export type BonusCandidatePlayer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarWoundedUrl: string | null;
  avatarCriticalUrl: string | null;
  avatarVictoryUrl: string | null;
  avatarDefeatUrl: string | null;
  createdAt: Date;
};

export function avatarTiersOf(p: {
  avatarUrl: string | null;
  avatarWoundedUrl: string | null;
  avatarCriticalUrl: string | null;
  avatarVictoryUrl: string | null;
  avatarDefeatUrl: string | null;
}): AvatarTiers {
  return {
    fresh: p.avatarUrl,
    wounded: p.avatarWoundedUrl,
    critical: p.avatarCriticalUrl,
    victory: p.avatarVictoryUrl,
    defeat: p.avatarDefeatUrl,
  };
}

function participants(m: LeagueMatchActivity): string[] {
  return m.playerBId ? [m.playerAId, m.playerBId] : [m.playerAId];
}

function activityTime(m: LeagueMatchActivity): number {
  return (m.completedAt ?? m.createdAt).getTime();
}

/**
 * A tournament match that has a player at a table right now: in progress,
 * or dealt in the active round and not yet started. Pairings drafted into a
 * pending round don't count — the organizer may still redo them.
 */
function isRunningTournamentMatch(
  m: LeagueMatchActivity,
  eventId: string
): boolean {
  if (!m.roundId || m.eventId !== eventId) return false;
  if (m.status === "in_progress") return true;
  return m.status === "pending" && m.roundStatus === "active";
}

export type RankBonusOpponentsArgs = {
  me: string;
  players: BonusCandidatePlayer[];
  /** Seats in the ongoing event, if there is one. */
  eventRoster: { playerId: string }[];
  eventId: string | null;
  activity: LeagueMatchActivity[];
  busyIds: Set<string>;
  now: Date;
};

/**
 * Four tiers, named by what the challenger is likeliest to want:
 * 1. seated in the ongoing event and free (not in a running match or bonus game),
 * 2. seated in the ongoing event but tied up right now,
 * 3. anyone else who played a bonus game in the last 30 days and is free,
 * 4. the rest of the league, most recently active first.
 * Tiers 1–3 sort by name; "recently active" means the newest match they were
 * part of, falling back to when they joined the league.
 */
export function rankBonusOpponents(
  args: RankBonusOpponentsArgs
): BonusOpponent[] {
  const { me, players, eventRoster, eventId, activity, busyIds, now } = args;
  const seated = new Set(eventRoster.map((r) => r.playerId));
  const lastActive = new Map<string, number>();
  const lastBonus = new Map<string, number>();
  const pairedNow = new Map<string, number | null>();

  for (const m of activity) {
    const t = activityTime(m);
    for (const id of participants(m)) {
      lastActive.set(id, Math.max(lastActive.get(id) ?? 0, t));
      if (!m.roundId) lastBonus.set(id, Math.max(lastBonus.get(id) ?? 0, t));
      if (eventId && isRunningTournamentMatch(m, eventId))
        pairedNow.set(id, m.roundNumber);
    }
  }

  const recentCutoff = now.getTime() - RECENT_BONUS_WINDOW_MS;
  const ranked = players
    .filter((p) => p.id !== me)
    .map((p) => {
      const status: BonusOpponentStatus = busyIds.has(p.id)
        ? "bonus_game"
        : pairedNow.has(p.id)
          ? "round_match"
          : "free";
      const tiedUp = status !== "free";
      const inEvent = seated.has(p.id);
      const recentBonus = (lastBonus.get(p.id) ?? 0) >= recentCutoff;
      const tier: BonusOpponentTier = inEvent
        ? tiedUp
          ? 2
          : 1
        : recentBonus && !tiedUp
          ? 3
          : 4;
      return {
        opponent: {
          playerId: p.id,
          displayName: p.displayName,
          avatars: avatarTiersOf(p),
          status,
          roundNumber: status === "round_match" ? (pairedNow.get(p.id) ?? null) : null,
          tier,
          group: TIER_LABELS[tier],
        },
        lastActiveAt: lastActive.get(p.id) ?? p.createdAt.getTime(),
      };
    });

  ranked.sort((a, b) => {
    if (a.opponent.tier !== b.opponent.tier) return a.opponent.tier - b.opponent.tier;
    if (a.opponent.tier === 4 && a.lastActiveAt !== b.lastActiveAt)
      return b.lastActiveAt - a.lastActiveAt;
    return a.opponent.displayName.localeCompare(b.opponent.displayName);
  });
  return ranked.map((r) => r.opponent);
}

function foldName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Typeahead filter: a case- and accent-insensitive substring match on the
 * display name. Empty queries return everyone.
 */
export function filterBonusOpponents<T extends { displayName: string }>(
  opponents: T[],
  query: string
): T[] {
  const q = foldName(query);
  if (!q) return opponents;
  return opponents.filter((o) => foldName(o.displayName).includes(q));
}

/** Consecutive runs of the same group, preserving the ranked order. */
export function groupBonusOpponents<T extends { group: string }>(
  opponents: T[]
): { group: string; members: T[] }[] {
  const groups: { group: string; members: T[] }[] = [];
  for (const o of opponents) {
    const last = groups[groups.length - 1];
    if (last && last.group === o.group) last.members.push(o);
    else groups.push({ group: o.group, members: [o] });
  }
  return groups;
}
