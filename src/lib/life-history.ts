/**
 * Per-game life history, kept on the phone only. Answers the mid-game
 * "wait, what was I at before that attack?" without a schema change: the
 * scorekeeper already sees every life total (its own taps plus the other
 * phone's via SSE/poll), so it just remembers the transitions for the game in
 * front of it and forgets them when the next game starts.
 *
 * Taps on the same side within MERGE_WINDOW_MS collapse into one entry, so
 * five quick −1 taps read as "20 → 15", not five rows.
 */

export type LifeSide = "a" | "b";

export type LifeHistoryEntry = {
  side: LifeSide;
  from: number;
  to: number;
  /** When the change started (ms). */
  at: number;
  /** When it was last extended by a merged tap (ms). */
  lastAt: number;
};

export type LifeHistory = {
  gameId: string;
  entries: LifeHistoryEntry[];
};

export const MERGE_WINDOW_MS = 4000;
const MAX_ENTRIES = 200;

export function emptyHistory(gameId: string): LifeHistory {
  return { gameId, entries: [] };
}

/**
 * Record a life total moving from `from` to `to`. Returns a new history; a
 * change that lands back where its merged run started drops the entry (a tap
 * and its immediate correction leave no trace).
 */
export function recordLifeChange(
  history: LifeHistory,
  side: LifeSide,
  from: number,
  to: number,
  now: number
): LifeHistory {
  if (from === to) return history;
  const entries = history.entries.slice();
  const last = entries[entries.length - 1];
  if (last && last.side === side && last.to === from && now - last.lastAt <= MERGE_WINDOW_MS) {
    if (last.from === to) entries.pop();
    else entries[entries.length - 1] = { ...last, to, lastAt: now };
  } else {
    entries.push({ side, from, to, at: now, lastAt: now });
  }
  return {
    gameId: history.gameId,
    entries: entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries,
  };
}

/** Keyed per game so an undone game win brings its history back with it. */
export function historyStorageKey(gameId: string): string {
  return `mtg:life-history:${gameId}`;
}

/** Parse a stored history, keeping it only if it belongs to `gameId`. */
export function parseStoredHistory(
  raw: string | null,
  gameId: string
): LifeHistory {
  if (!raw) return emptyHistory(gameId);
  try {
    const parsed = JSON.parse(raw) as LifeHistory;
    if (parsed?.gameId !== gameId || !Array.isArray(parsed.entries))
      return emptyHistory(gameId);
    return parsed;
  } catch {
    return emptyHistory(gameId);
  }
}
