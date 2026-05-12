/**
 * Add a Cloudflare WAF "skip managed rules" custom rule for POST requests to
 * mtg.capxun.com. Idempotent — re-running won't create duplicates.
 *
 *   npm run cf:skip-waf
 *
 * Requires CLOUDFLARE_API_TOKEN in .env.local with scopes:
 *   - Zone › Zone › Read
 *   - Zone › Zone WAF › Edit
 *   scoped to capxun.com.
 *
 * Why: Cloudflare's managed OWASP ruleset flags multipart selfie uploads on
 * the wizardize endpoint as malicious, returning a 403 block page. The
 * server action never sees the request. This rule tells Cloudflare to
 * forward POSTs to mtg.capxun.com straight through without WAF inspection
 * — reads (page loads, image fetches) still go through WAF normally.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_NAME = "capxun.com";
const HOST = "mtg.capxun.com";
const RULE_DESCRIPTION = "Skip WAF managed rules for mtg-dash POST uploads";
const EXPRESSION = `(http.host eq "${HOST}" and http.request.method eq "POST")`;

if (!TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN not set in .env.local");
  process.exit(1);
}

const API = "https://api.cloudflare.com/client/v4";

type CfResp<T> = {
  success: boolean;
  errors: { code: number; message: string }[];
  messages: { code: number; message: string }[];
  result: T;
};

async function cf<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as CfResp<T>;
  if (!body.success) {
    throw new Error(
      `${res.status} ${path}: ${body.errors.map((e) => `${e.code} ${e.message}`).join("; ")}`
    );
  }
  return body.result;
}

type Zone = { id: string; name: string };
type RulesetSummary = { id: string; phase: string; kind: string };
type CustomRule = {
  id?: string;
  description?: string;
  expression: string;
  action: string;
  action_parameters?: Record<string, unknown>;
  enabled?: boolean;
};
type Ruleset = {
  id: string;
  phase: string;
  rules?: CustomRule[];
};

async function main() {
  // 1. Look up zone id by name.
  const zones = await cf<Zone[]>(`/zones?name=${ZONE_NAME}`);
  if (zones.length === 0) throw new Error(`zone not found: ${ZONE_NAME}`);
  const zoneId = zones[0].id;
  console.log(`✓ zone ${ZONE_NAME} → ${zoneId}`);

  // 2. Find the entrypoint ruleset for http_request_firewall_custom.
  const rulesets = await cf<RulesetSummary[]>(
    `/zones/${zoneId}/rulesets`
  );
  const entry = rulesets.find(
    (r) =>
      r.phase === "http_request_firewall_custom" && r.kind === "zone"
  );

  let rulesetId: string;
  if (entry) {
    rulesetId = entry.id;
    console.log(`✓ found existing custom ruleset ${rulesetId}`);
  } else {
    const created = await cf<Ruleset>(
      `/zones/${zoneId}/rulesets`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "default",
          kind: "zone",
          phase: "http_request_firewall_custom",
          rules: [],
        }),
      }
    );
    rulesetId = created.id;
    console.log(`✓ created custom ruleset ${rulesetId}`);
  }

  // 3. Read full ruleset to see existing rules.
  const full = await cf<Ruleset>(
    `/zones/${zoneId}/rulesets/${rulesetId}`
  );
  const existing = (full.rules ?? []).find(
    (r) => r.description === RULE_DESCRIPTION
  );

  const newRule: CustomRule = {
    description: RULE_DESCRIPTION,
    expression: EXPRESSION,
    action: "skip",
    action_parameters: {
      ruleset: "current",
      // Skip the managed WAF + rate limiting for matched requests. We still
      // want bot detection and TLS checks; those are separate phases.
      phases: ["http_ratelimit", "http_request_firewall_managed"],
      products: ["waf", "rateLimit", "securityLevel"],
    },
    enabled: true,
  };

  if (existing) {
    // Update in place via rule endpoint.
    await cf(
      `/zones/${zoneId}/rulesets/${rulesetId}/rules/${existing.id}`,
      {
        method: "PATCH",
        body: JSON.stringify(newRule),
      }
    );
    console.log(`✓ updated existing rule ${existing.id}`);
  } else {
    await cf(`/zones/${zoneId}/rulesets/${rulesetId}/rules`, {
      method: "POST",
      body: JSON.stringify(newRule),
    });
    console.log(`✓ created new rule`);
  }

  console.log(`\nDone. POSTs to ${HOST} now bypass managed WAF rules.`);
}

main().catch((err) => {
  console.error("failed:", err);
  process.exit(1);
});
