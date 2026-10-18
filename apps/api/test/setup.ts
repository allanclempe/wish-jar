import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, vi } from 'vitest';

import { FAMILY_STARTS_NAME } from '../src/FamilyStarts';
import { TEST_PURGE_TOKEN, TEST_PURGE_ZONE } from './purgeKeys';
import { DUMMY_TOKEN, TEST_SECRET_KEY } from './turnstileKeys';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const PURGE_API = `https://api.cloudflare.com/client/v4/zones/${TEST_PURGE_ZONE}/purge_cache`;

// Tokens that make the stand-in below answer like Cloudflare does when a token
// has been used already, when it has trouble of its own, or can't be reached.
export const USED_TOKEN = 'used-token';
export const CLOUDFLARE_ERROR_TOKEN = 'cloudflare-error';
export const CLOUDFLARE_DOWN_TOKEN = 'cloudflare-down';
// Tokens that Cloudflare passes, but from a widget on another page: Wish Jar's
// site, and a page that isn't Wish Jar's.
export const SITE_TOKEN = 'site-token';
export const OTHER_PAGE_TOKEN = 'other-page-token';

// What the API sent to siteverify, for the tests that look.
export const siteverifyCalls: FormData[] = [];

// Cloudflare's siteverify, answered here so the tests need no network. With
// the test secret it passes the dummy token, as Cloudflare does, with the
// hostname Cloudflare gives every test widget.
async function siteverify(form: FormData): Promise<Response> {
  siteverifyCalls.push(form);
  const token = form.get('response');
  if (token === CLOUDFLARE_DOWN_TOKEN) throw new TypeError('Network connection lost');
  const reply = (body: object) => Response.json({ challenge_ts: new Date().toISOString(), ...body });
  if (token === CLOUDFLARE_ERROR_TOKEN) return reply({ success: false, 'error-codes': ['internal-error'] });
  if (form.get('secret') !== TEST_SECRET_KEY) return reply({ success: false, 'error-codes': ['invalid-input-secret'] });
  if (token === USED_TOKEN) return reply({ success: false, 'error-codes': ['timeout-or-duplicate'] });
  if (token === SITE_TOKEN) return reply({ success: true, hostname: 'wish-jar.blastin.dev', 'error-codes': [] });
  if (token === OTHER_PAGE_TOKEN) {
    return reply({ success: true, hostname: 'appassets.androidplatform.net', 'error-codes': [] });
  }
  if (token !== DUMMY_TOKEN) return reply({ success: false, 'error-codes': ['invalid-input-response'] });
  return reply({ success: true, hostname: 'example.com', 'error-codes': [] });
}

// The URLs the API asked Cloudflare's purge API to purge, a request each
// (WJ-59), and how the stand-in below answers: like Cloudflare, with an error
// Cloudflare gives, or not at all.
export const purgeCalls: string[][] = [];
export const purgeAnswer: { now: 'purged' | 'refused' | 'down' } = { now: 'purged' };

// Cloudflare's purge-by-URL API, answered here so the tests need no network.
async function purgeApi(request: Request): Promise<Response> {
  if (purgeAnswer.now === 'down') throw new TypeError('Network connection lost');
  if (request.headers.get('Authorization') !== `Bearer ${TEST_PURGE_TOKEN}`) {
    return Response.json({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, { status: 403 });
  }
  const { files } = (await request.json()) as { files: string[] };
  purgeCalls.push(files);
  if (purgeAnswer.now === 'refused') {
    const errors = [{ code: 1134, message: 'Unable to purge, rate limit reached.' }];
    return Response.json({ success: false, errors, messages: [], result: null }, { status: 429 });
  }
  return Response.json({ success: true, errors: [], messages: [], result: { id: crypto.randomUUID() } });
}

beforeEach(async () => {
  // Every test starts the day with no families started (WJ-57), so the cap
  // for everyone only meets the tests about it.
  await runInDurableObject(env.FAMILY_STARTS.getByName(FAMILY_STARTS_NAME), (_, state) => state.storage.deleteAll());
  siteverifyCalls.length = 0;
  purgeCalls.length = 0;
  purgeAnswer.now = 'purged';
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url === SITEVERIFY) return siteverify(await request.formData());
    if (request.url === PURGE_API && request.method === 'POST') return purgeApi(request);
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.mocked(globalThis.fetch).mockRestore();
});
