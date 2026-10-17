import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CALLER_LIMITS, callerKey } from '../src/CallerLimits';
import { FAMILIES_PER_DAY, FAMILY_STARTS_NAME } from '../src/FamilyStarts';
import type { CreateFamilyReply, JoinCode } from '../src/jar/api';
import { DAILY_WRITES } from '../src/jar/dailyWrites';
import { MAX_JAR_BYTES } from '../src/jar/limits';
import { fromSomewhere } from './caller';

const BASE = 'https://relay.example';
const APP = 'https://wish-jar.blastin.dev';
const HOUR_S = 60 * 60;

function relay(path: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(`${BASE}${path}`, init)));
}

// Each test's own caller, apart from every other request's.
let lastIp = 0;
function nextIp(): string {
  lastIp += 1;
  return `192.0.2.${lastIp}`;
}

function from(ip: string, headers: Record<string, string> = {}): Record<string, string> {
  return { 'CF-Connecting-IP': ip, ...headers };
}

function startFamily(ip?: string) {
  return relay('/families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP, ...(ip ? from(ip) : {}) },
    body: JSON.stringify({ label: 'Phone' }),
  });
}

async function newFamily(): Promise<CreateFamilyReply> {
  const response = await startFamily();
  expect(response.status).toBe(201);
  return response.json();
}

// Makes `max` requests that the limit lets through, then one that it
// doesn't: a 429 with how long to wait.
async function reachLimit(
  max: number,
  send: () => Promise<Response>,
  allowed: (status: number) => boolean,
): Promise<Response> {
  for (let count = 0; count < max; count++) {
    const response = await send();
    expect(allowed(response.status), `request ${count + 1}: ${response.status}`).toBe(true);
  }
  const refused = await send();
  expect(refused.status).toBe(429);
  return refused;
}

function retryAfter(response: Response): number {
  return Number(response.headers.get('Retry-After'));
}

// A socket to /jar/live with a token of the family's no device holds: it
// opens and closes at once (4401), past the limit.
async function openSocket(ip: string, familyId: string): Promise<Response> {
  const response = await relay('/jar/live', {
    headers: from(ip, {
      Upgrade: 'websocket',
      Origin: APP,
      'Sec-WebSocket-Protocol': `wish-jar, bearer.${familyId}.${'A'.repeat(43)}`,
    }),
  });
  response.webSocket?.accept();
  return response;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('per-caller limits', () => {
  it('lets a caller start only a few families a day', async () => {
    const ip = nextIp();
    const refused = await reachLimit(CALLER_LIMITS.families.max, () => startFamily(ip), (status) => status === 201);
    expect(retryAfter(refused)).toBeGreaterThan(23 * HOUR_S);
    expect(retryAfter(refused)).toBeLessThanOrEqual(24 * HOUR_S);
    // Readable by Wish Jar's pages.
    expect(refused.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(refused.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(await refused.text()).toContain('try again tomorrow');
    // Still turned away, and anyone else still let through.
    expect((await startFamily(ip)).status).toBe(429);
    expect((await startFamily(nextIp())).status).toBe(201);
  });

  it("doesn't count preflights", async () => {
    const ip = nextIp();
    for (let count = 0; count <= CALLER_LIMITS.families.max; count++) {
      const preflight = await relay('/families', {
        method: 'OPTIONS',
        headers: from(ip, { Origin: APP, 'Access-Control-Request-Method': 'POST' }),
      });
      expect(preflight.status).toBe(204);
    }
    expect((await startFamily(ip)).status).toBe(201);
  });

  it('counts a whole IPv6 /64 as one caller', async () => {
    const key = (ip: string) => callerKey(new Request(BASE, { headers: from(ip) }));
    expect(key('2001:db8:a:b::1')).toBe('2001:db8:a:b::/64');
    expect(key('2001:0DB8:000a:000b:ffff:1:2:3')).toBe('2001:db8:a:b::/64');
    expect(key('2001:db8::7')).toBe('2001:db8:0:0::/64');
    expect(key('::1')).toBe('0:0:0:0::/64');
    expect(key('203.0.113.9')).toBe('203.0.113.9');

    for (let count = 0; count < CALLER_LIMITS.families.max; count++) {
      expect((await startFamily(`2001:db8:51:1::${count + 1}`)).status).toBe(201);
    }
    expect((await startFamily('2001:db8:51:1:dead:beef:0:1')).status).toBe(429);
    expect((await startFamily('2001:db8:51:2::1')).status).toBe(201);
  });

  it('lets a caller ask for photo codes, a burst at a time', async () => {
    const ip = nextIp();
    const refused = await reachLimit(
      CALLER_LIMITS.photoCodes.max,
      () => relay('/codes', { method: 'POST', headers: from(ip, { Origin: APP }) }),
      (status) => status === 201,
    );
    expect(retryAfter(refused)).toBeGreaterThan(HOUR_S - 60);
    expect(refused.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
  });

  it('limits the photos a phone sends, before reading them', async () => {
    const ip = nextIp();
    const send = () =>
      relay('/s/ZZZZZZ/photo', {
        method: 'POST',
        headers: from(ip, { 'Content-Type': 'image/jpeg' }),
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      });
    const refused = await reachLimit(CALLER_LIMITS.phonePhotos.max, send, (status) => status === 410);
    expect(retryAfter(refused)).toBeGreaterThan(0);
  });

  it('lets a caller ask for join codes, a few at a time', async () => {
    const { token } = await newFamily();
    const ip = nextIp();
    await reachLimit(
      CALLER_LIMITS.joinCodes.max,
      () => relay('/devices/codes', { method: 'POST', headers: from(ip, { Authorization: `Bearer ${token}` }) }),
      (status) => status === 201,
    );
  });

  it('limits the joins from a caller, with right codes too', async () => {
    const { token } = await newFamily();
    const ip = nextIp();
    const join = async () => {
      // The codes come from the family's device, elsewhere.
      const codeReply = await relay('/devices/codes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const { code } = (await codeReply.json()) as JoinCode;
      return relay('/devices/join', {
        method: 'POST',
        headers: from(ip, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ code, label: 'Tablet' }),
      });
    };
    const refused = await reachLimit(CALLER_LIMITS.joins.max, join, (status) => status === 201);
    expect(await refused.text()).toContain('Too many tries');
  });

  it("limits the Echo Show's rejoins from a caller", async () => {
    const ip = nextIp();
    const rejoin = () =>
      relay('/devices/echo-show', {
        method: 'POST',
        headers: from(ip, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ alexaDeviceId: `amzn1.ask.device.${'X'.repeat(40)}` }),
      });
    await reachLimit(CALLER_LIMITS.echoShows.max, rejoin, (status) => status === 404);
  });

  it('limits the photos a caller puts in a jar, before reading them', async () => {
    const { token } = await newFamily();
    const ip = nextIp();
    const upload = () =>
      relay('/photos', {
        method: 'POST',
        headers: from(ip, { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${token}` }),
        body: 'not a jpeg',
      });
    const refused = await reachLimit(CALLER_LIMITS.uploads.max, upload, (status) => status === 415);
    expect(await refused.text()).toContain('Too many photos');
  });

  it('limits the live sockets a caller opens', async () => {
    const { familyId } = await newFamily();
    const ip = nextIp();
    const refused = await reachLimit(
      CALLER_LIMITS.live.max,
      () => openSocket(ip, familyId),
      (status) => status === 101,
    );
    expect(retryAfter(refused)).toBeGreaterThan(9 * 60);
    expect(retryAfter(refused)).toBeLessThanOrEqual(10 * 60);
  });

  it('keeps the counts of live sockets in memory, writing nothing', async () => {
    const { familyId } = await newFamily();
    const ip = nextIp();
    expect((await openSocket(ip, familyId)).status).toBe(101);
    const limits = env.CALLER_LIMITS.getByName(ip);
    expect((await runInDurableObject(limits, (_, state) => state.storage.list())).size).toBe(0);
    expect(await runDurableObjectAlarm(limits)).toBe(false);
  });

  it("forgets a caller's count when its window ends", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const ip = nextIp();
    await reachLimit(CALLER_LIMITS.families.max, () => startFamily(ip), (status) => status === 201);
    expect((await relay('/codes', { method: 'POST', headers: from(ip, { Origin: APP }) })).status).toBe(201);

    vi.setSystemTime(Date.now() + 24 * HOUR_S * 1000 + 1000);
    expect((await startFamily(ip)).status).toBe(201);

    // The alarm drops the counts whose windows have ended and keeps the rest;
    // once the last one is gone, nothing of the caller is left.
    const limits = env.CALLER_LIMITS.getByName(ip);
    const kept = () => runInDurableObject(limits, async (_, state) => [...(await state.storage.list()).keys()]);
    expect(await runDurableObjectAlarm(limits)).toBe(true);
    expect(await kept()).toEqual(['families']);
    vi.setSystemTime(Date.now() + 24 * HOUR_S * 1000 + 1000);
    expect(await runDurableObjectAlarm(limits)).toBe(true);
    expect(await kept()).toEqual([]);
    expect(await runDurableObjectAlarm(limits)).toBe(false);
  });
});

describe('new families for everyone (WJ-57)', () => {
  const DAY_MS = 24 * HOUR_S * 1000;
  const familyStarts = () => env.FAMILY_STARTS.getByName(FAMILY_STARTS_NAME);
  // Today's families started so far, as kept.
  const started = (count: number) =>
    runInDurableObject(familyStarts(), (_, state) =>
      state.storage.put('started', { day: Math.floor(Date.now() / DAY_MS), count }),
    );
  const startedToday = () =>
    runInDurableObject(familyStarts(), async (_, state) => {
      return (await state.storage.get<{ count: number }>('started'))?.count;
    });

  it("adds up to well under half of the Free plan's 5 GB", () => {
    // Families nobody comes back to last 7 days, so those alive span 8 UTC
    // days, each one at most a full jar.
    expect(8 * FAMILIES_PER_DAY * MAX_JAR_BYTES).toBeLessThan(5e9 / 2);
    expect(DAILY_WRITES.bytes).toBeLessThanOrEqual(MAX_JAR_BYTES);
  });

  it('lets only so many families start a day, and leaves the ones started alone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T18:00:00Z'));
    const { token } = await newFamily();

    await started(FAMILIES_PER_DAY - 1);
    expect((await startFamily(nextIp())).status).toBe(201);
    const refused = await startFamily(nextIp());
    expect(refused.status).toBe(429);
    expect(await refused.text()).toMatch(/all the new family jars it can today/);
    // Until 00:00 UTC.
    expect(retryAfter(refused)).toBe(6 * HOUR_S);
    expect(refused.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(await startedToday()).toBe(FAMILIES_PER_DAY);

    const call = await relay('/jar/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fn: 'insertKid', args: [{ name: 'Ava', photoUri: null }] }),
    });
    expect(call.status).toBe(200);

    vi.setSystemTime(new Date('2026-10-18T00:00:01Z'));
    expect((await startFamily(nextIp())).status).toBe(201);
    expect(await startedToday()).toBe(1);
  });

  it("doesn't count a start the check or the caller's limit turned away", async () => {
    const ip = nextIp();
    await reachLimit(CALLER_LIMITS.families.max, () => startFamily(ip), (status) => status === 201);
    const failedCheck = await relay('/families', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Turnstile-Token': 'not-a-token' },
      body: '{}',
    });
    expect(failedCheck.status).toBe(403);
    expect(await startedToday()).toBe(CALLER_LIMITS.families.max);
  });
});
