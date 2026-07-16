import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Wizardize is the only action that spends money (~$0.01/portrait on fal,
// GPU-minutes locally), so it gets rate limits before anything else does.
// Uses the same KV env as pubsub (Upstash marketplace integration) — when
// unset (local dev, lan, verify) the checks are a no-op.

function isConfigured() {
  return Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  );
}

let _limits: { perPlayer: Ratelimit; perLeague: Ratelimit } | null = null;

function getLimits() {
  if (_limits) return _limits;
  const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
  _limits = {
    perPlayer: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 h"),
      prefix: "rl:wiz:p",
    }),
    perLeague: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 d"),
      prefix: "rl:wiz:l",
    }),
  };
  return _limits;
}

export async function checkWizardizeLimit(playerId: string, leagueId: string) {
  if (!isConfigured()) return;
  const { perPlayer, perLeague } = getLimits();
  const player = await perPlayer.limit(playerId);
  if (!player.success) {
    throw new Error(
      "Portrait limit reached — you can regenerate up to 3 times an hour. Take a breather and try again soon."
    );
  }
  const league = await perLeague.limit(leagueId);
  if (!league.success) {
    throw new Error(
      "This league hit its daily portrait budget. Try again tomorrow."
    );
  }
}
