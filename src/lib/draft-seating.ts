/**
 * Draft pod seating derived from round-1 pairings. MTG convention seats
 * round-1 opponents directly across the table from each other, so table k's
 * two players take seats k and k + half. Byes go last so the paired seats
 * stay opposite; the bye player fills the leftover seat.
 */
export type SeatingPairing = {
  tableNumber: number;
  playerAId: string;
  playerBId: string | null;
};

export function draftSeatOrder(pairings: SeatingPairing[]): string[] {
  const ordered = [...pairings].sort(
    (x, y) =>
      Number(x.playerBId === null) - Number(y.playerBId === null) ||
      x.tableNumber - y.tableNumber
  );
  const pairs = ordered.filter((p) => p.playerBId !== null);
  const byes = ordered.filter((p) => p.playerBId === null);
  return [
    ...pairs.map((p) => p.playerAId),
    ...byes.map((p) => p.playerAId),
    ...pairs.map((p) => p.playerBId!),
  ];
}
