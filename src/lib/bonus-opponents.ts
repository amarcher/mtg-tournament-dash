export type BonusOpponent = {
  playerId: string;
  displayName: string;
  busy: boolean;
  group?: string;
};

export const IN_EVENT_GROUP = "In this event";
export const OTHER_LEAGUE_GROUP = "Other league wizards";

/**
 * Challenge list for the event waiting room. Bonus games are league-scoped,
 * so anyone in the league is fair game — a friend who skipped the draft but
 * showed up for side games shouldn't need the QR dance. Event players stay
 * on top (seed order) since they're the likeliest opponents.
 */
export function buildEventBonusOpponents(args: {
  me: string;
  roster: { playerId: string; displayName: string }[];
  leaguePlayers: { id: string; displayName: string }[];
  busyIds: Set<string>;
}): BonusOpponent[] {
  const { me, roster, leaguePlayers, busyIds } = args;
  const rosterIds = new Set(roster.map((r) => r.playerId));
  const inEvent = roster
    .filter((r) => r.playerId !== me)
    .map((r) => ({
      playerId: r.playerId,
      displayName: r.displayName,
      busy: busyIds.has(r.playerId),
      group: IN_EVENT_GROUP,
    }));
  const others = leaguePlayers
    .filter((p) => p.id !== me && !rosterIds.has(p.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((p) => ({
      playerId: p.id,
      displayName: p.displayName,
      busy: busyIds.has(p.id),
      group: OTHER_LEAGUE_GROUP,
    }));
  return [...inEvent, ...others];
}
