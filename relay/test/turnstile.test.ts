import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { CALLER_LIMITS } from '../src/CallerLimits';
import { fromSomewhere } from './caller';
import { CLOUDFLARE_DOWN_TOKEN, CLOUDFLARE_ERROR_TOKEN, siteverifyCalls, USED_TOKEN } from './setup';
import { DUMMY_TOKEN, TEST_SECRET_KEY } from './turnstileKeys';

const BASE = 'https://relay.example';
const APP = 'https://wish-jar.blastin.dev';
const TEST_SITE_KEY = '1x00000000000000000000AA';

function relay(path: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(`${BASE}${path}`, init)));
}

// `token` null sends no Turnstile token at all.
function startFamily(token: string | null, headers: Record<string, string> = {}) {
  return relay('/families', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: APP,
      // An empty header is no token too; it keeps fromSomewhere from adding one.
      'Turnstile-Token': token ?? '',
      ...headers,
    },
    body: JSON.stringify({ label: 'Phone' }),
  });
}

describe('starting a family (WJ-54)', () => {
  it('starts one with a token Cloudflare passes, sending it the secret and the address', async () => {
    const response = await startFamily(DUMMY_TOKEN, { 'CF-Connecting-IP': '198.51.100.7' });
    expect(response.status).toBe(201);
    expect(siteverifyCalls).toHaveLength(1);
    const [form] = siteverifyCalls;
    expect(form.get('secret')).toBe(TEST_SECRET_KEY);
    expect(form.get('response')).toBe(DUMMY_TOKEN);
    expect(form.get('remoteip')).toBe('198.51.100.7');
  });

  it('turns one away without a token, without asking Cloudflare', async () => {
    const response = await startFamily(null);
    expect(response.status).toBe(403);
    // Wish Jar's pages read why.
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(siteverifyCalls).toHaveLength(0);
  });

  it('turns one away with a token Cloudflare turns down', async () => {
    expect((await startFamily('not-a-real-token')).status).toBe(403);
    expect((await startFamily(USED_TOKEN)).status).toBe(403);
    expect(siteverifyCalls).toHaveLength(2);
  });

  it("turns away a token longer than any of Cloudflare's, without asking it", async () => {
    expect((await startFamily('x'.repeat(2049))).status).toBe(403);
    expect(siteverifyCalls).toHaveLength(0);
  });

  it("answers 503 when Cloudflare can't check, so the app tries again", async () => {
    expect((await startFamily(CLOUDFLARE_ERROR_TOKEN)).status).toBe(503);
    expect((await startFamily(CLOUDFLARE_DOWN_TOKEN)).status).toBe(503);
  });

  it("doesn't count a refusal toward the caller's families for the day", async () => {
    const ip = '198.51.100.8';
    for (let count = 0; count <= CALLER_LIMITS.families.max; count++) {
      expect((await startFamily(null, { 'CF-Connecting-IP': ip })).status).toBe(403);
    }
    expect((await startFamily(DUMMY_TOKEN, { 'CF-Connecting-IP': ip })).status).toBe(201);
  });

  it('turns one away before reading its body', async () => {
    const response = await relay('/families', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Turnstile-Token': '' },
      body: 'not even JSON',
    });
    expect(response.status).toBe(403);
  });
});

describe('the Turnstile page for the phone app', () => {
  it('shows the widget for the site key it was given', async () => {
    const response = await relay(`/turnstile?sitekey=${TEST_SITE_KEY}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    expect(policy).toContain("script-src 'unsafe-inline' https://challenges.cloudflare.com");
    expect(policy).toContain('frame-src https://challenges.cloudflare.com');
    const html = await response.text();
    expect(html).toContain(`sitekey: "${TEST_SITE_KEY}"`);
    expect(html).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    expect(html).toContain('window.ReactNativeWebView.postMessage');
  });

  it("turns away a site key that doesn't look like one", async () => {
    expect((await relay('/turnstile')).status).toBe(400);
    expect((await relay('/turnstile?sitekey=%22%3C%2Fscript%3E')).status).toBe(400);
  });
});
