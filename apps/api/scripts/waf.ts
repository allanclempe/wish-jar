import { blockExpression, RATE_LIMIT, rateLimitExpression, API_HOST, SITE_HOST } from '../src/routes';

// The API's two WAF rules on the blastin.dev zone (README.md, "The edge
// rules", WJ-70), built from src/routes.ts and deployed with the API by
// scripts/deploy-waf.ts. Each phase's rules belong to the whole zone, so only
// the rule with our `ref` is written; every other rule there is left as it is.

export type WafRule = {
  ref: string;
  description: string;
  expression: string;
  action: 'block';
  enabled: true;
  ratelimit?: {
    characteristics: string[];
    period: number;
    requests_per_period: number;
    mitigation_timeout: number;
    requests_to_origin: boolean;
  };
};

export type WafPhase = 'http_ratelimit' | 'http_request_firewall_custom';

export type WafDeployment = { phase: WafPhase; rule: WafRule };

export function wafRules(): WafDeployment[] {
  return [
    {
      phase: 'http_ratelimit',
      rule: {
        // The refs keep the API's old name: they're how a deploy finds the rule.
        ref: 'wish-jar-relay-open-endpoints',
        description: 'Wish Jar API: open endpoints',
        expression: rateLimitExpression(),
        action: 'block',
        enabled: true,
        ratelimit: {
          // cf.colo.id is required; the Free plan counts by IP within it.
          characteristics: ['ip.src', 'cf.colo.id'],
          period: RATE_LIMIT.periodSeconds,
          requests_per_period: RATE_LIMIT.requests,
          mitigation_timeout: RATE_LIMIT.blockSeconds,
          requests_to_origin: false,
        },
      },
    },
    {
      phase: 'http_request_firewall_custom',
      rule: {
        ref: 'wish-jar-relay-routes',
        description: "Wish Jar API: paths and methods it doesn't serve",
        expression: blockExpression(API_HOST, SITE_HOST),
        action: 'block',
        enabled: true,
      },
    },
  ];
}

type Ruleset = { id: string; rules?: { id: string; ref?: string; description?: string }[] };
type ApiReply<T> = { success: boolean; errors?: { code: number; message: string }[]; result: T };

export type WafOptions = {
  zoneId: string;
  token: string;
  fetch?: typeof fetch;
  api?: string;
};

// What deployWaf did with each rule.
export type WafOutcome = { ref: string; phase: WafPhase; done: 'created' | 'added' | 'updated' };

// Writes each rule into its phase's entry point ruleset: the rule with its
// `ref`, or else the one with its description (the rules made by hand in the
// dashboard before WJ-70, which then get the `ref`), is updated in place;
// with neither it's added, and a phase with no ruleset yet gets one.
export async function deployWaf(options: WafOptions): Promise<WafOutcome[]> {
  const call = caller(options);
  const outcomes: WafOutcome[] = [];
  for (const { phase, rule } of wafRules()) {
    const entrypoint = `/zones/${options.zoneId}/rulesets/phases/${phase}/entrypoint`;
    const ruleset = await call<Ruleset>('GET', entrypoint, undefined, true);
    if (!ruleset) {
      await call('PUT', entrypoint, { rules: [rule] });
      outcomes.push({ ref: rule.ref, phase, done: 'created' });
      continue;
    }
    const rules = ruleset.rules ?? [];
    const kept = rules.find((r) => r.ref === rule.ref) ?? rules.find((r) => r.description === rule.description);
    const base = `/zones/${options.zoneId}/rulesets/${ruleset.id}/rules`;
    if (kept) {
      await call('PATCH', `${base}/${kept.id}`, rule);
      outcomes.push({ ref: rule.ref, phase, done: 'updated' });
    } else {
      await call('POST', base, rule);
      outcomes.push({ ref: rule.ref, phase, done: 'added' });
    }
  }
  return outcomes;
}

function caller({ token, fetch: doFetch = fetch, api = 'https://api.cloudflare.com/client/v4' }: WafOptions) {
  // `orNull`: a 404 is null, as for a phase with no ruleset yet.
  return async function call<T>(method: string, path: string, body?: unknown, orNull = false): Promise<T | null> {
    const response = await doFetch(`${api}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (orNull && response.status === 404) return null;
    const reply = (await response.json().catch(() => null)) as ApiReply<T> | null;
    if (!response.ok || !reply?.success) {
      const why = reply?.errors?.map((error) => `${error.code} ${error.message}`).join('; ') || response.statusText;
      throw new Error(`${method} ${path}: ${response.status} ${why}`);
    }
    return reply.result;
  };
}
