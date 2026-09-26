"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  emptyHistory,
  historyStorageKey,
  parseStoredHistory,
  recordLifeChange,
  type LifeHistory,
} from "@/lib/life-history";

/**
 * Watches the two life totals a scorekeeper renders and remembers every
 * change for the current game (see life-history.ts). Lives in a ref rather
 * than state — nothing re-renders on a tap; the history sheet reads it when
 * opened. Mirrored to sessionStorage so a reload mid-game keeps it.
 */
export function useLifeHistory(
  gameIdRef: { readonly current: string },
  aLife: number,
  bLife: number
): () => LifeHistory {
  const history = useRef<LifeHistory | null>(null);
  const prev = useRef<{ a: number; b: number } | null>(null);

  useEffect(() => {
    const gameId = gameIdRef.current;
    const now = Date.now();
    let h = history.current;
    if (!h || h.gameId !== gameId) {
      // First render, or a new game was dealt / an old one reopened.
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(historyStorageKey(gameId));
      } catch {
        /* storage blocked — history just won't survive a reload */
      }
      h = parseStoredHistory(raw, gameId);
    } else if (prev.current) {
      h = recordLifeChange(h, "a", prev.current.a, aLife, now);
      h = recordLifeChange(h, "b", prev.current.b, bLife, now);
    }
    history.current = h;
    prev.current = { a: aLife, b: bLife };
    try {
      sessionStorage.setItem(historyStorageKey(gameId), JSON.stringify(h));
    } catch {
      /* ignore */
    }
  }, [gameIdRef, aLife, bLife]);

  return useCallback(
    () => history.current ?? emptyHistory(gameIdRef.current),
    [gameIdRef]
  );
}
