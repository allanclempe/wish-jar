import { describe, expect, it } from 'vitest';

import { blockExpression, RATE_LIMITED_PATHS, RELAY_HOST, ROUTES, SITE_HOST, wildcardMatch } from '../src/routes';
import { deployWaf, wafRules, type WafRule } from '../scripts/waf';

const ZONE = 'zone-1';
const API = 'https://api.test/client/v4';

type StoredRule = Partial<WafRule> & { id: string; ref?: string; description?: string };

// Cloudflare's rulesets API, as far as deployWaf uses it: each phase's entry
// point ruleset, its rules, and every call made.
function fakeApi(phases: Record<string, StoredRule[]> = {}) {
  const rulesets = new Map(Object.entries(phases).map(([phase, rules], index) => [phase, { id: `rs-${index}`, rules }]));
  const calls: string[] = [];
  let ids = 0;
  const ok = (result: unknown) => Response.json({ success: true, errors: [], result });

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
    const path = url.pathname.replace('/client/v4', '');
    calls.push(`${method} ${path}`);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    const entry = path.match(/^\/zones\/zone-1\/rulesets\/phases\/([a-z_]+)\/entrypoint$/);
    if (entry) {
      const ruleset = rulesets.get(entry[1]);
      if (method === 'GET') {
        return ruleset ? ok(ruleset) : Response.json({ success: false, errors: [{ code: 10003, message: 'not found' }] }, { status: 404 });
      }
      const created = { id: `rs-new-${entry[1]}`, rules: (body.rules as WafRule[]).map((rule) => ({ ...rule, id: `r-${++ids}` })) };
      rulesets.set(entry[1], created);
      return ok(created);
    }
    const rules = path.match(/^\/zones\/zone-1\/rulesets\/([^/]+)\/rules(?:\/([^/]+))?$/);
    const ruleset = rules && [...rulesets.values()].find((r) => r.id === rules[1]);
    if (!ruleset) return Response.json({ success: false, errors: [{ code: 7003, message: 'no route' }] }, { status: 404 });
    if (method === 'POST' && !rules![2]) ruleset.rules.push({ ...(body as WafRule), id: `r-${++ids}` });
    else if (method === 'PATCH' && rules![2]) {
      const index = ruleset.rules.findIndex((rule) => rule.id === rules![2]);
      ruleset.rules[index] = { ...(body as WafRule), id: rules![2] };
    } else return Response.json({ success: false, errors: [{ code: 7000, message: 'bad' }] }, { status: 400 });
    return ok(ruleset);
  };
  return { fetch: fetch as typeof globalThis.fetch, rulesets, calls };
}

const options = (api: ReturnType<typeof fakeApi>) => ({ zoneId: ZONE, token: 'token', fetch: api.fetch, api: API });
const [rateRule, routesRule] = wafRules().map((deployment) => deployment.rule);

describe('the WAF rules (WJ-70)', () => {
  it('are built from src/routes.ts', () => {
    expect(routesRule.expression).toBe(blockExpression(RELAY_HOST, SITE_HOST));
    // A custom rule's expression can be at most 4,096 characters.
    expect(routesRule.expression.length).toBeLessThan(4096);
    for (const path of RATE_LIMITED_PATHS) expect(rateRule.expression).toContain(`"${path}"`);
    // Every endpoint counted is one the relay serves.
    for (const path of RATE_LIMITED_PATHS) {
      expect(ROUTES.some((route) => wildcardMatch(route.path, path)), path).toBe(true);
    }
    // The Free plan's rule: 10 seconds, blocking for 10.
    expect(rateRule.ratelimit).toMatchObject({ period: 10, mitigation_timeout: 10 });
    expect(rateRule.ratelimit?.characteristics).toContain('cf.colo.id');
  });

  it('make each phase its ruleset when the zone has none yet', async () => {
    const api = fakeApi();
    const outcomes = await deployWaf(options(api));
    expect(outcomes.map((outcome) => outcome.done)).toEqual(['created', 'created']);
    expect(api.rulesets.get('http_ratelimit')?.rules).toMatchObject([rateRule]);
    expect(api.rulesets.get('http_request_firewall_custom')?.rules).toMatchObject([routesRule]);
  });

  it('take over the rules made by hand, and leave every other rule on the zone alone', async () => {
    const other = { id: 'other', description: 'Another site on the zone', expression: 'true', action: 'block' } as StoredRule;
    const api = fakeApi({
      http_ratelimit: [{ id: 'by-hand', description: 'Wish Jar relay: open endpoints', expression: 'old' }],
      http_request_firewall_custom: [other, { id: 'by-hand-2', description: routesRule.description, expression: 'old' }],
    });
    expect((await deployWaf(options(api))).map((outcome) => outcome.done)).toEqual(['updated', 'updated']);
    expect(api.rulesets.get('http_ratelimit')?.rules).toEqual([{ ...rateRule, id: 'by-hand' }]);
    expect(api.rulesets.get('http_request_firewall_custom')?.rules).toEqual([other, { ...routesRule, id: 'by-hand-2' }]);
    // One rule at a time: never a PUT that would replace the zone's other rules.
    expect(api.calls.filter((call) => call.startsWith('PUT'))).toEqual([]);
  });

  it('find their rule by its ref from then on, and add it where it is missing', async () => {
    const api = fakeApi({
      http_ratelimit: [{ id: 'r', ref: rateRule.ref, description: 'renamed', expression: 'old' }],
      http_request_firewall_custom: [{ id: 'other', description: 'Another site on the zone' }],
    });
    expect((await deployWaf(options(api))).map((outcome) => outcome.done)).toEqual(['updated', 'added']);
    expect(api.rulesets.get('http_ratelimit')?.rules).toEqual([{ ...rateRule, id: 'r' }]);
    expect(api.rulesets.get('http_request_firewall_custom')?.rules).toHaveLength(2);

    // Deploying again changes nothing but the same rules.
    await deployWaf(options(api));
    expect(api.rulesets.get('http_ratelimit')?.rules).toHaveLength(1);
    expect(api.rulesets.get('http_request_firewall_custom')?.rules).toHaveLength(2);
  });

  it("stops at the first call Cloudflare turns down, saying why", async () => {
    const fetch = (async () =>
      Response.json({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, { status: 403 })) as typeof globalThis.fetch;
    await expect(deployWaf({ zoneId: ZONE, token: 'token', fetch, api: API })).rejects.toThrow(
      /403 10000 Authentication error/,
    );
  });
});
