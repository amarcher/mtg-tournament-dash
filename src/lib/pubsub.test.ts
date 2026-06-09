import { describe, it, expect, vi, beforeEach } from "vitest";
import { publish, subscribe, type EventMessage } from "./pubsub";

// publish() stamps a `ts` field on every message; tests assert on the
// non-timestamp payload by stripping it before comparison.
type PublishInput = Parameters<typeof publish>[1];
function stripTs(m: EventMessage): PublishInput {
  const rest = { ...m } as Partial<EventMessage>;
  delete rest.ts;
  return rest as PublishInput;
}

// These tests exercise the in-process Map fallback that kicks in when
// KV_REST_API_URL is unset. That fallback is what `npm run dev`, `npm run
// lan`, and `npm run verify` all depend on — provisioning Upstash should
// stay optional for local development.

beforeEach(() => {
  // Force the in-process path regardless of whether .env.local was loaded
  // into the test runner's environment.
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
});

function uniqueEventId(label: string): string {
  // Each test gets its own channel so subscriber sets don't bleed across.
  return `test-${label}-${Math.random().toString(36).slice(2)}`;
}

describe("pubsub (in-process fallback)", () => {
  it("delivers a published event to every subscriber on the same channel", async () => {
    const id = uniqueEventId("fanout");
    const a: EventMessage[] = [];
    const b: EventMessage[] = [];
    await subscribe(id, (m) => a.push(m));
    await subscribe(id, (m) => b.push(m));
    await publish(id, { type: "round_started", roundNumber: 1 });
    expect(a.map(stripTs)).toEqual([{ type: "round_started", roundNumber: 1 }]);
    expect(b.map(stripTs)).toEqual([{ type: "round_started", roundNumber: 1 }]);
    expect(a[0].ts).toEqual(expect.any(Number));
  });

  it("does not deliver across distinct channels", async () => {
    const idA = uniqueEventId("isolate-a");
    const idB = uniqueEventId("isolate-b");
    const seen: EventMessage[] = [];
    await subscribe(idA, (m) => seen.push(m));
    await publish(idB, { type: "round_started", roundNumber: 3 });
    expect(seen).toEqual([]);
  });

  it("publish is a no-op when no subscribers are registered", async () => {
    // Should resolve without throwing — and ideally without allocating
    // a subscriber set (we just check it doesn't blow up).
    await expect(
      publish(uniqueEventId("empty"), { type: "round_started", roundNumber: 0 })
    ).resolves.toBeUndefined();
  });

  it("subscribe returns an unsubscribe that detaches the callback", async () => {
    const id = uniqueEventId("unsub");
    const seen: EventMessage[] = [];
    const unsub = await subscribe(id, (m) => seen.push(m));
    await publish(id, { type: "round_started", roundNumber: 1 });
    expect(seen).toHaveLength(1);
    const ret = unsub();
    // The in-process path returns a plain function — await tolerates either
    // a sync or async unsubscribe.
    await Promise.resolve(ret);
    await publish(id, { type: "round_started", roundNumber: 2 });
    expect(seen).toHaveLength(1); // still just the first event
  });

  it("a throwing subscriber gets dropped without breaking the fan-out", async () => {
    const id = uniqueEventId("throw");
    const goodSeen: EventMessage[] = [];
    await subscribe(id, () => {
      throw new Error("boom");
    });
    await subscribe(id, (m) => goodSeen.push(m));
    await publish(id, {
      type: "life_changed",
      matchId: "m1",
      gameId: "g1",
      side: "a",
      life: 17,
    });
    // The throwing subscriber should not have prevented `goodSeen` from
    // receiving the event.
    expect(goodSeen.map(stripTs)).toEqual([
      {
        type: "life_changed",
        matchId: "m1",
        gameId: "g1",
        side: "a",
        life: 17,
      },
    ]);
    // The throwing subscriber should have been removed — re-publishing
    // shouldn't trigger a second throw on the same path.
    await expect(
      publish(id, {
        type: "life_changed",
        matchId: "m1",
        gameId: "g1",
        side: "a",
        life: 16,
      })
    ).resolves.toBeUndefined();
  });

  it("delivers every EventMessage variant unchanged", async () => {
    const id = uniqueEventId("variants");
    const seen: EventMessage[] = [];
    await subscribe(id, (m) => seen.push(m));
    const variants: PublishInput[] = [
      { type: "round_started", roundNumber: 1 },
      { type: "round_completed", roundNumber: 1 },
      {
        type: "life_changed",
        matchId: "m1",
        gameId: "g1",
        side: "b",
        life: 5,
      },
      {
        type: "game_complete",
        matchId: "m1",
        winnerId: "p1",
        nextGameNumber: 2,
        newGameId: "g2",
      },
      { type: "match_complete", matchId: "m1", winnerId: "p1" },
    ];
    for (const v of variants) await publish(id, v);
    expect(seen.map(stripTs)).toEqual(variants);
    for (const m of seen) expect(m.ts).toEqual(expect.any(Number));
  });
});
