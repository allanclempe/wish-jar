import { afterEach, beforeEach, vi } from 'vitest';

import { DUMMY_TOKEN, TEST_SECRET_KEY } from './turnstileKeys';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Tokens that make the stand-in below answer like Cloudflare does when a token
// has been used already, when it has trouble of its own, or can't be reached.
export const USED_TOKEN = 'used-token';
export const CLOUDFLARE_ERROR_TOKEN = 'cloudflare-error';
export const CLOUDFLARE_DOWN_TOKEN = 'cloudflare-down';

// What the relay sent to siteverify, for the tests that look.
export const siteverifyCalls: FormData[] = [];

// Cloudflare's siteverify, answered here so the tests need no network. With
// the test secret it passes the dummy token, as Cloudflare does.
async function siteverify(form: FormData): Promise<Response> {
  siteverifyCalls.push(form);
  const token = form.get('response');
  if (token === CLOUDFLARE_DOWN_TOKEN) throw new TypeError('Network connection lost');
  const reply = (body: object) => Response.json({ challenge_ts: new Date().toISOString(), ...body });
  if (token === CLOUDFLARE_ERROR_TOKEN) return reply({ success: false, 'error-codes': ['internal-error'] });
  if (form.get('secret') !== TEST_SECRET_KEY) return reply({ success: false, 'error-codes': ['invalid-input-secret'] });
  if (token === USED_TOKEN) return reply({ success: false, 'error-codes': ['timeout-or-duplicate'] });
  if (token !== DUMMY_TOKEN) return reply({ success: false, 'error-codes': ['invalid-input-response'] });
  return reply({ success: true, hostname: 'example.com', 'error-codes': [] });
}

beforeEach(() => {
  siteverifyCalls.length = 0;
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url === SITEVERIFY) return siteverify(await request.formData());
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.mocked(globalThis.fetch).mockRestore();
});
