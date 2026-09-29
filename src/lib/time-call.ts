/**
 * The table's rule when a round runs out of time: whoever is ahead in games
 * takes the match (a game-1 win with game 2 cut off is a 1-0 match win);
 * level games — 1-1 with game 3 cut off, or nothing finished — is a draw.
 */
export function outcomeAtTime(aWins: number, bWins: number): "a" | "b" | "draw" {
  if (aWins > bWins) return "a";
  if (bWins > aWins) return "b";
  return "draw";
}
