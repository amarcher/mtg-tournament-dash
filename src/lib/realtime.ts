import { Realtime } from "@upstash/realtime";
import { Redis } from "@upstash/redis";
import { realtimeSchema } from "./realtime-schema";

// `Realtime` lives in module state so producer (server actions) and consumer
// (SSE route) share the same instance. Created lazily so that local dev (no
// KV_REST_API_URL set) doesn't crash at import time — pubsub.ts checks the
// env var first and only reaches in here when Upstash is configured.
function buildRealtime() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Upstash KV env (KV_REST_API_URL / KV_REST_API_TOKEN) not set"
    );
  }
  const redis = new Redis({ url, token });
  return new Realtime({
    redis,
    schema: realtimeSchema,
    // Vercel's default function-duration cap on Hobby is 300s; matching it
    // here lets the SSE handler exit cleanly instead of getting killed cold.
    maxDurationSecs: 300,
    history: {
      // 200 messages × ~1KB ≈ enough for any single round, and far more than
      // a reconnect window typically needs to replay.
      maxLength: 200,
      // 2 hours covers the longest realistic tournament. Older history is
      // dropped automatically so we never accumulate stale data.
      expireAfterSecs: 7200,
    },
  });
}

let _realtime: ReturnType<typeof buildRealtime> | null = null;

export function getRealtime(): ReturnType<typeof buildRealtime> {
  if (!_realtime) _realtime = buildRealtime();
  return _realtime;
}

export function isRealtimeConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  );
}
