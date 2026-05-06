/**
 * In-process pub/sub for SSE fan-out, keyed by event id.
 *
 * Fluid Compute reuses function instances, so a single host running a single
 * tournament will land on the same instance for both producers (mutations)
 * and consumers (SSE streams). If we ever need cross-instance fan-out, swap
 * for Redis pub/sub or Vercel Queues.
 */

export type EventMessage =
  | { type: "round_started"; roundNumber: number }
  | { type: "round_completed"; roundNumber: number }
  | {
      type: "life_changed";
      matchId: string;
      gameId: string;
      side: "a" | "b";
      life: number;
    }
  | {
      type: "game_complete";
      matchId: string;
      winnerId: string;
      nextGameNumber: number;
    }
  | { type: "match_complete"; matchId: string; winnerId: string };

type Subscriber = (msg: EventMessage) => void;

// Persist across hot reloads in dev with a global symbol.
const KEY = Symbol.for("mtg.dash.pubsub");
type Store = Map<string, Set<Subscriber>>;
const globalAny = globalThis as unknown as { [k: symbol]: Store | undefined };
if (!globalAny[KEY]) globalAny[KEY] = new Map();
const store: Store = globalAny[KEY]!;

export function subscribe(eventId: string, subscriber: Subscriber): () => void {
  let set = store.get(eventId);
  if (!set) {
    set = new Set();
    store.set(eventId, set);
  }
  set.add(subscriber);
  return () => {
    set!.delete(subscriber);
    if (set!.size === 0) store.delete(eventId);
  };
}

export function publish(eventId: string, message: EventMessage): void {
  const set = store.get(eventId);
  if (!set) return;
  for (const sub of set) {
    try {
      sub(message);
    } catch {
      // Subscriber threw — drop them.
      set.delete(sub);
    }
  }
}
