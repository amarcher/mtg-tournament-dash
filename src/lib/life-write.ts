/**
 * Server-side compare-and-set guard for life writes.
 *
 * `adjustLifeAction` used to take a bare `delta` and apply it to whatever game
 * was active, with no causality token — so a delta computed by a client
 * looking at a stale game (or a duplicated/retried request) was applied
 * blindly. This makes the write conditional on the client's expected state:
 * the update proceeds only if the active game and its current life total still
 * match what the client believed when it computed the delta.
 *
 * Note the game identity is part of the compared state on purpose: comparing
 * the life value alone has a false-match hole at game boundaries (e.g. both
 * games of a match start at 20), so a stale tap from a previous game could
 * coincidentally match the new game's starting life. Requiring the gameId
 * closes that.
 */
export type LifeWriteRejection = "no_active_game" | "stale_game" | "stale_life";

export type LifeWriteState = {
  /** Active (un-won) game id for the match, or null if none is open. */
  activeGameId: string | null;
  /** Current stored life for the targeted side in the active game. */
  storedLife: number | null;
};

export type LifeWriteRequest = {
  /** Game the client believed it was acting on. */
  gameId: string;
  /** Life the client showed for this side before applying its delta. */
  expectedLife: number;
};

export function checkLifeWrite(
  state: LifeWriteState,
  req: LifeWriteRequest
): { ok: true } | { ok: false; reason: LifeWriteRejection } {
  if (state.activeGameId === null || state.storedLife === null) {
    return { ok: false, reason: "no_active_game" };
  }
  if (req.gameId !== state.activeGameId) {
    return { ok: false, reason: "stale_game" };
  }
  if (req.expectedLife !== state.storedLife) {
    return { ok: false, reason: "stale_life" };
  }
  return { ok: true };
}
