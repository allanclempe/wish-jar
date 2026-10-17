import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { fromSomewhere } from './caller';

import { CODE_LETTERS } from '../src/codes';
import type { CreateFamilyReply, DeviceList, JoinCode } from '../src/jar/api';
import { MAX_JOIN_MISSES } from '../src/JoinCode';

const BASE = 'https://relay.example';
const APP = 'https://wish-jar-app.blastin.dev';

function relay(path: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(`${BASE}${path}`, init)));
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function newFamily(label = 'Phone'): Promise<CreateFamilyReply> {
  const response = await relay('/families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  expect(response.status).toBe(201);
  return response.json();
}

function askForCode(token: string) {
  return relay('/devices/codes', { method: 'POST', headers: auth(token) });
}

async function newCode(token: string): Promise<JoinCode> {
  const response = await askForCode(token);
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json();
}

// Each test's own IP address, so one test's wrong codes don't slow another.
let lastIp = 0;
function nextIp(): string {
  lastIp += 1;
  return `203.0.113.${lastIp}`;
}

function join(body: unknown, ip = nextIp()) {
  return relay('/devices/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
}

async function joined(code: string, label?: string): Promise<CreateFamilyReply> {
  const response = await join({ code, label });
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json();
}

async function devices(token: string): Promise<DeviceList['devices']> {
  const response = await relay('/devices', { headers: auth(token) });
  expect(response.status).toBe(200);
  return ((await response.json()) as DeviceList).devices;
}

function remove(token: string, deviceId: number) {
  return relay(`/devices/${deviceId}`, { method: 'DELETE', headers: auth(token) });
}

function call(token: string, fn: string, args: unknown[] = []) {
  return relay('/jar/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(token) },
    body: JSON.stringify({ fn, args }),
  });
}

describe('join codes', () => {
  it('hands a device of the family a short code and the link with it, for 10 minutes', async () => {
    const { token } = await newFamily();
    const before = Date.now();
    const { code, expiresAt, url } = await newCode(token);
    expect(code).toHaveLength(6);
    expect([...code].every((letter) => CODE_LETTERS.includes(letter))).toBe(true);
    expect(expiresAt - before).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
    expect(expiresAt - before).toBeLessThanOrEqual(10 * 60_000 + 1000);
    expect(url).toBe(`${APP}/?join=${code}`);
  });

  it('only hands codes to a device of the family', async () => {
    const { familyId } = await newFamily();
    expect((await relay('/devices/codes', { method: 'POST' })).status).toBe(401);
    expect((await askForCode(`${familyId}.${'A'.repeat(43)}`)).status).toBe(401);
  });

  it('draws the QR code for the link as SVG', async () => {
    const { token } = await newFamily();
    const { code } = await newCode(token);
    const response = await relay(`/qr/join/${code}.svg`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await response.text()).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+".*<path d="M/);
    expect((await relay('/qr/join/nope.svg')).status).toBe(404);
  });

  it('drops a code its family closes, and no other family can', async () => {
    const one = await newFamily();
    const two = await newFamily();
    const { code } = await newCode(one.token);
    const close = (token: string) =>
      relay(`/devices/codes/${code}`, { method: 'DELETE', headers: auth(token) });
    expect((await close(two.token)).status).toBe(403);
    expect((await close(one.token)).status).toBe(204);
    expect((await close(one.token)).status).toBe(410);
    expect((await join({ code })).status).toBe(410);
  });

  it('runs out when its time is up', async () => {
    const { token } = await newFamily();
    const { code } = await newCode(token);
    const stub = env.JOIN_CODES.getByName(code);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await join({ code })).status).toBe(410);

    // Past its time even before the alarm runs.
    const late = await newCode(token);
    await runInDurableObject(env.JOIN_CODES.getByName(late.code), async (_, state) => {
      const stored = await state.storage.get<{ expiresAt: number }>('join');
      await state.storage.put('join', { ...stored, expiresAt: Date.now() - 1 });
    });
    expect((await join({ code: late.code })).status).toBe(410);
  });
});

describe('joining', () => {
  it("gives the new device its own token to the family's jar", async () => {
    const parent = await newFamily();
    await call(parent.token, 'insertKid', [{ name: 'Mia', photoUri: null }]);
    const { code } = await newCode(parent.token);

    // Typed in any case, with a space.
    const device = await joined(`${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`, 'Frameo frame');
    expect(device.familyId).toBe(parent.familyId);
    expect(device.token).not.toBe(parent.token);
    expect(device.token).toMatch(new RegExp(`^${parent.familyId}\\.[A-Za-z0-9_-]{43}$`));

    const kids = await call(device.token, 'listKids');
    expect(kids.status).toBe(200);
    expect(((await kids.json()) as { result: { name: string }[] }).result.map((kid) => kid.name)).toEqual([
      'Mia',
    ]);
  });

  it('works once', async () => {
    const { token } = await newFamily();
    const { code } = await newCode(token);
    await joined(code);
    const again = await join({ code });
    expect(again.status).toBe(410);
    expect(await again.text()).toContain('run out or was already used');
  });

  it("keeps only a hash of the new device's secret", async () => {
    const { token, familyId } = await newFamily();
    const device = await joined((await newCode(token)).code, 'Echo Show');
    const secret = device.token.split('.')[1];
    const rows = await runInDurableObject(env.FAMILY_JARS.getByName(familyId), (_, state) =>
      state.storage.sql.exec('SELECT * FROM devices').toArray(),
    );
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(rows[1].secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[1].label).toBe('Echo Show');
  });

  it('turns away a body that is not a code, without using the code up', async () => {
    const { token } = await newFamily();
    const { code } = await newCode(token);
    expect((await join({ code: 'nope' })).status).toBe(400);
    expect((await join({ code: 7 })).status).toBe(400);
    expect((await join([])).status).toBe(400);
    expect((await join({ code, label: 'x'.repeat(61) })).status).toBe(400);
    expect((await join({ code, label: 7 })).status).toBe(400);
    const notJson = await relay('/devices/join', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ code }),
    });
    expect(notJson.status).toBe(415);
    await joined(code);
  });

  it('slows down a caller trying wrong codes, and only that caller', async () => {
    const { token } = await newFamily();
    const { code } = await newCode(token);
    const ip = nextIp();
    // A code nobody holds: CODE_LETTERS has no 0 or 1, but these are letters
    // it has, so the code is well formed.
    const wrong = code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    for (let miss = 0; miss < MAX_JOIN_MISSES; miss++) {
      expect((await join({ code: wrong }, ip)).status).toBe(410);
    }
    const blocked = await join({ code }, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('900');
    // The right code still works from elsewhere, and wasn't used up.
    await joined(code);

    // The misses are forgotten when the window ends.
    expect(await runDurableObjectAlarm(env.JOIN_ATTEMPTS.getByName(ip))).toBe(true);
    expect((await join({ code: wrong }, ip)).status).toBe(410);
  });

  it('only takes POST', async () => {
    expect((await relay('/devices/join')).status).toBe(405);
  });
});

describe("the family's devices", () => {
  it('lists every device, oldest first, marking the one asking', async () => {
    const parent = await newFamily('Phone');
    const frame = await joined((await newCode(parent.token)).code, 'Frameo frame');
    const browser = await joined((await newCode(parent.token)).code);

    const seenByParent = await devices(parent.token);
    expect(seenByParent.map((device) => [device.label, device.thisDevice])).toEqual([
      ['Phone', true],
      ['Frameo frame', false],
      [null, false],
    ]);
    for (const device of seenByParent) {
      expect(Date.now() - device.addedAt).toBeLessThan(60_000);
      expect(device.lastSeenAt).toBeGreaterThanOrEqual(device.addedAt);
    }
    expect((await devices(frame.token)).map((device) => device.thisDevice)).toEqual([false, true, false]);
    expect((await devices(browser.token))[2].thisDevice).toBe(true);
  });

  it('removes a device, whose token opens nothing from then on', async () => {
    const parent = await newFamily();
    const lost = await joined((await newCode(parent.token)).code, 'Phone');
    const [, lostDevice] = await devices(parent.token);

    expect((await remove(parent.token, lostDevice.id)).status).toBe(204);
    expect((await devices(parent.token)).map((device) => device.id)).not.toContain(lostDevice.id);
    for (const response of [
      await call(lost.token, 'listKids'),
      await relay('/devices', { headers: auth(lost.token) }),
      await askForCode(lost.token),
      await remove(lost.token, 1),
    ]) {
      expect(response.status).toBe(401);
    }
    expect((await call(parent.token, 'listKids')).status).toBe(200);
    expect((await remove(parent.token, lostDevice.id)).status).toBe(404);
  });

  it("won't remove the device asking, or another family's", async () => {
    const one = await newFamily();
    const two = await newFamily();
    const [self] = await devices(one.token);
    const own = await remove(one.token, self.id);
    expect(own.status).toBe(409);
    expect(await own.text()).toContain('this device');
    expect((await call(one.token, 'listKids')).status).toBe(200);

    // Ids are per family: one's token only ever reaches one's own devices
    // (two's first device has the same id as one's).
    const [other] = await devices(two.token);
    expect((await remove(one.token, other.id)).status).toBe(409);
    expect((await call(two.token, 'listKids')).status).toBe(200);
  });

  it('needs a device of the family', async () => {
    expect((await relay('/devices')).status).toBe(401);
    const nobody = `${'A'.repeat(43)}.${'B'.repeat(43)}`;
    expect((await relay('/devices', { headers: auth(nobody) })).status).toBe(401);
    expect((await remove(nobody, 1)).status).toBe(401);
  });

  it('turns away other methods and paths', async () => {
    const { token } = await newFamily();
    expect((await relay('/devices', { method: 'POST', headers: auth(token) })).status).toBe(405);
    expect((await relay('/devices/codes', { headers: auth(token) })).status).toBe(405);
    expect((await relay('/devices/1', { headers: auth(token) })).status).toBe(405);
    expect((await relay('/devices/nope', { method: 'DELETE', headers: auth(token) })).status).toBe(404);
  });
});

describe('CORS', () => {
  it("lets Wish Jar's pages in, with the token and JSON", async () => {
    const preflight = await relay('/devices/7', {
      method: 'OPTIONS',
      headers: {
        Origin: APP,
        'Access-Control-Request-Method': 'DELETE',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, DELETE');
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type');

    const { token } = await newFamily();
    const listed = await relay('/devices', { headers: { Origin: APP, ...auth(token) } });
    expect(listed.status).toBe(200);
    expect(listed.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(listed.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps other sites out', async () => {
    const { token } = await newFamily();
    const { code } = await newCode(token);
    const response = await relay('/devices/join', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(response.status).toBe(403);
    // Turned away before the code was looked at.
    await joined(code);
  });
});
