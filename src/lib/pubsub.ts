import {
  REALTIME_EVENT_NAMES,
  channelForEvent,
  type EventMessage,
} from "./realtime-schema";
import { getRealtime, isRealtimeConfigured } from "./realtime";

export type { EventMessage } from "./realtime-schema";

type Subscriber = (msg: EventMessage) => void;

// In-process fallback used when KV_REST_API_URL is unset (local dev,
// `npm run lan`, `npm run verify`). Persists across HMR via a global symbol
// so the dev server picks up the same Map after each module reload.
const KEY = Symbol.for("mtg.dash.pubsub");
type Store = Map<string, Set<Subscriber>>;
const globalAny = globalThis as unknown as { [k: symbol]: Store | undefined };
if (!globalAny[KEY]) globalAny[KEY] = new Map();
const store: Store = globalAny[KEY]!;

/**
 * Fan out an event to every active subscriber on this tournament.
 *
 * - In prod (Upstash configured): publishes to `event:<eventId>` via
 *   Realtime. Messages persist in Redis Streams under our `history`
 *   config so a reconnecting SSE client can replay missed events.
 * - In local dev (no Upstash env): in-process Map fan-out, same shape as
 *   the original pubsub. No history, no cross-instance — fine for dev
 *   where the producer and consumer share one process.
 */
export async function publish(
  eventId: string,
  message: EventMessage
): Promise<void> {
  if (isRealtimeConfigured()) {
    const { type, ...data } = message;
    // Realtime's emit is heavily generic-narrowed — TS can't relate the
    // discriminated-union pair (type, data) back to the schema map without
    // a per-case switch. The two values come from the same EventMessage
    // member, so the runtime invariant holds.
    const ch = getRealtime().channel(channelForEvent(eventId)) as unknown as {
      emit: (event: string, data: object) => Promise<void>;
    };
    await ch.emit(type, data);
    return;
  }
  const set = store.get(eventId);
  if (!set) return;
  for (const sub of set) {
    try {
      sub(message);
    } catch {
      set.delete(sub);
    }
  }
}

/**
 * Listen for events on this tournament. Returns an async-cleanup function
 * that the SSE handler invokes on connection close.
 *
 * On the Realtime path, the underlying subscription pulls recent history on
 * connect — `historyLimit` messages worth — so reconnects after a function-
 * duration cliff don't drop events published mid-gap.
 */
export async function subscribe(
  eventId: string,
  subscriber: Subscriber,
  options: { historyLimit?: number } = {}
): Promise<() => void | Promise<void>> {
  if (isRealtimeConfigured()) {
    // Same generic-narrowing issue as `publish` — schema-bound types reject
    // the dynamic event-name list. Cast through unknown so we can pass the
    // list verbatim; the schema validates payload shape at runtime anyway.
    const ch = getRealtime().channel(channelForEvent(eventId)) as unknown as {
      subscribe: (args: {
        events: readonly string[];
        onData: (e: { event: string; data: unknown }) => void;
        history?: { limit: number };
      }) => Promise<() => void | Promise<void>>;
    };
    const unsubscribe = await ch.subscribe({
      events: REALTIME_EVENT_NAMES,
      onData: (e) => {
        try {
          subscriber({
            type: e.event,
            ...(e.data as object),
          } as EventMessage);
        } catch {
          /* subscriber threw — Realtime keeps the stream alive */
        }
      },
      history:
        options.historyLimit && options.historyLimit > 0
          ? { limit: options.historyLimit }
          : undefined,
    });
    return unsubscribe;
  }
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
