export type ManualPairing = { playerAId: string; playerBId: string | null };

/**
 * Validate a hand-built set of pairings for a whole round. Players left out
 * are allowed — they sit the round out, same as a dropped pending pair — but
 * nobody can be seated twice, and at most one table can be a bye.
 */
export function validateManualPairings(
  pairings: ManualPairing[],
  activePlayerIds: ReadonlySet<string>
): void {
  if (pairings.length === 0) throw new Error("Add at least one table");
  const seen = new Set<string>();
  let byes = 0;
  for (const { playerAId, playerBId } of pairings) {
    if (playerBId === null) byes++;
    for (const id of playerBId === null ? [playerAId] : [playerAId, playerBId]) {
      if (!activePlayerIds.has(id))
        throw new Error("Every player must be active on the event roster");
      if (seen.has(id)) throw new Error("A player can only sit at one table");
      seen.add(id);
    }
  }
  if (byes > 1) throw new Error("Only one player can have the bye");
}
