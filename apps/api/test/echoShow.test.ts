import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { fromSomewhere } from './caller';

import { echoShowHash, echoShowSecretHash } from '../src/echoShow';
import type { CreateFamilyReply, DeviceList, JoinCode } from '@wish-jar/jar';
import { JAR_VERSION, jarVersion, migrateJar } from '../src/jar/schema';

const BASE = 'https://api.example';

function api(path: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(`${BASE}${path}`, init)));
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// Each test's own Show: real ids are amzn1.ask.device. and ~150 more characters.
let shows = 0;
function newAlexaId(): string {
  shows += 1;
  return `amzn1.ask.device.${String(shows).padStart(4, '0')}${'AEXAMPLE'.repeat(20)}`;
}

async function newFamily(label = 'Phone'): Promise<CreateFamilyReply> {
  const response = await postJson('/families', { label });
  expect(response.status).toBe(201);
  return response.json();
}

let lastIp = 0;
async function joinWithCode(parentToken: string, label: string): Promise<CreateFamilyReply> {
  const codeReply = await api('/devices/codes', { method: 'POST', headers: auth(parentToken) });
  const { code } = (await codeReply.json()) as JoinCode;
  lastIp += 1;
  const response = await postJson(
    '/devices/join',
    { code, label },
    { 'CF-Connecting-IP': `198.51.100.${lastIp}` },
  );
  expect(response.status).toBe(201);
  return response.json();
}

// What the Alexa skill keeps for each Show (WJ-60).
function newShowSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The secret each test's Show sends when the test names none.
const secrets = new Map<unknown, string>();
function secretOf(alexaDeviceId: unknown): string {
  if (!secrets.has(alexaDeviceId)) secrets.set(alexaDeviceId, newShowSecret());
  return secrets.get(alexaDeviceId)!;
}

function link(token: string, alexaDeviceId: unknown, showSecret: unknown = secretOf(alexaDeviceId)) {
  return postJson('/devices/echo-show/link', { alexaDeviceId, showSecret }, auth(token));
}

function rejoin(alexaDeviceId: unknown, showSecret: unknown = secretOf(alexaDeviceId)) {
  return postJson('/devices/echo-show', { alexaDeviceId, showSecret });
}

async function rejoined(alexaDeviceId: string, showSecret = secretOf(alexaDeviceId)): Promise<CreateFamilyReply> {
  const response = await rejoin(alexaDeviceId, showSecret);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}

async function devices(token: string): Promise<DeviceList['devices']> {
  const response = await api('/devices', { headers: auth(token) });
  expect(response.status).toBe(200);
  return ((await response.json()) as DeviceList).devices;
}

function call(token: string, fn: string, args: unknown[] = []) {
  return postJson('/jar/call', { fn, args }, auth(token));
}

describe('the Echo Show', () => {
  it('gets a new token for the same device row at every launch once linked', async () => {
    const alexaId = newAlexaId();
    const show = await newFamily('Echo Show');
    expect((await link(show.token, alexaId)).status).toBe(204);
    await call(show.token, 'insertKid', [{ name: 'Mia', photoUri: null }]);

    const first = await rejoined(alexaId);
    expect(first.familyId).toBe(show.familyId);
    expect(first.token).not.toBe(show.token);
    // Last session's token opens nothing now.
    expect((await call(show.token, 'listKids')).status).toBe(401);
    const kids = (await (await call(first.token, 'listKids')).json()) as {
      result: { name: string }[];
    };
    expect(kids.result.map((kid) => kid.name)).toEqual(['Mia']);

    const second = await rejoined(alexaId);
    expect((await call(first.token, 'listKids')).status).toBe(401);
    const list = await devices(second.token);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ label: 'Echo Show', thisDevice: true });
  });

  it('keeps the row it joined with a code, without adding one per launch', async () => {
    const alexaId = newAlexaId();
    const parent = await newFamily();
    const show = await joinWithCode(parent.token, 'Echo Show');
    expect((await link(show.token, alexaId)).status).toBe(204);
    const before = await devices(parent.token);

    for (let launch = 0; launch < 3; launch++) await rejoined(alexaId);
    const after = await devices(parent.token);
    expect(after.map((device) => device.id)).toEqual(before.map((device) => device.id));
    expect(after.map((device) => device.label)).toEqual(['Phone', 'Echo Show']);
  });

  it("is turned away until it's linked, and with an id too short to be an Alexa one", async () => {
    expect((await rejoin(newAlexaId())).status).toBe(404);
    expect((await rejoin('amzn1.ask.device.short')).status).toBe(400);
    expect((await rejoin(42)).status).toBe(400);
    expect((await rejoin('A'.repeat(513))).status).toBe(400);
    const notJson = await api('/devices/echo-show', { method: 'POST', body: 'hello' });
    expect(notJson.status).toBe(415);
    expect((await api('/devices/echo-show')).status).toBe(405);

    const { token } = await newFamily();
    expect((await link(token, 'too short')).status).toBe(400);
  });

  it('links only for a device of the family', async () => {
    const { familyId } = await newFamily();
    const alexaId = newAlexaId();
    expect((await postJson('/devices/echo-show/link', { alexaDeviceId: alexaId })).status).toBe(401);
    expect((await link(`${familyId}.${'A'.repeat(43)}`, alexaId)).status).toBe(401);
    expect((await rejoin(alexaId)).status).toBe(404);
  });

  it('can no longer rejoin once a parent removes it', async () => {
    const alexaId = newAlexaId();
    const parent = await newFamily();
    const show = await joinWithCode(parent.token, 'Echo Show');
    await link(show.token, alexaId);
    const { token } = await rejoined(alexaId);

    const showRow = (await devices(parent.token)).find((device) => device.label === 'Echo Show');
    const removed = await api(`/devices/${showRow?.id}`, {
      method: 'DELETE',
      headers: auth(parent.token),
    });
    expect(removed.status).toBe(204);
    expect((await call(token, 'listKids')).status).toBe(401);
    expect((await rejoin(alexaId)).status).toBe(404);
    // The link is dropped as well.
    const hash = await echoShowHash(alexaId);
    expect(await env.ECHO_SHOW_LINKS.getByName(hash).familyId()).toBeNull();
    expect((await rejoin(alexaId)).status).toBe(404);
  });

  it('rejoins the family it joined last', async () => {
    const alexaId = newAlexaId();
    const first = await newFamily('Echo Show');
    await link(first.token, alexaId);

    const other = await newFamily();
    const show = await joinWithCode(other.token, 'Echo Show');
    await link(show.token, alexaId);
    expect((await rejoined(alexaId)).familyId).toBe(other.familyId);

    // Linked again in the first family, from a new row there: the old row
    // lets go, so there's only ever one row with the Show.
    const again = await joinWithCode(first.token, 'Echo Show');
    await link(again.token, alexaId);
    const back = await rejoined(alexaId);
    expect(back.familyId).toBe(first.familyId);
    const marked = await runInDurableObject(env.FAMILY_JARS.getByName(first.familyId), (_, state) =>
      state.storage.sql.exec('SELECT id FROM devices WHERE echo_show_hash IS NOT NULL').toArray(),
    );
    expect(marked).toHaveLength(1);
    const self = (await devices(back.token)).find((device) => device.thisDevice);
    expect(self?.id).toBe(marked[0].id);
  });

  it('keeps only a hash of the Alexa device id', async () => {
    const alexaId = newAlexaId();
    const { token, familyId } = await newFamily('Echo Show');
    await link(token, alexaId);
    const hash = await echoShowHash(alexaId);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const rows = await runInDurableObject(env.FAMILY_JARS.getByName(familyId), (_, state) =>
      state.storage.sql.exec('SELECT echo_show_hash FROM devices').toArray(),
    );
    expect(rows).toEqual([{ echo_show_hash: hash }]);
    const stored = await runInDurableObject(env.ECHO_SHOW_LINKS.getByName(hash), (_, state) =>
      state.storage.list(),
    );
    expect(JSON.stringify([...stored])).not.toContain(alexaId);
    expect(stored.get('familyId')).toBe(familyId);
  });

  it('brings a jar from before the Echo Show up to date', async () => {
    const { token, familyId } = await newFamily();
    await runInDurableObject(env.FAMILY_JARS.getByName(familyId), (_, state) => {
      const storage = state.storage;
      expect(jarVersion(storage)).toBe(JAR_VERSION);
      // Back to version 1, as a jar made before this change is.
      storage.sql.exec('DROP INDEX devices_echo_show_hash');
      storage.sql.exec('ALTER TABLE devices DROP COLUMN echo_show_hash');
      storage.sql.exec("UPDATE jar_meta SET value = '1' WHERE key = 'version'");
      migrateJar(storage);
      expect(jarVersion(storage)).toBe(JAR_VERSION);
    });
    const alexaId = newAlexaId();
    expect((await link(token, alexaId)).status).toBe(204);
    expect((await rejoined(alexaId)).familyId).toBe(familyId);
  });
});

describe("the Echo Show's secret", () => {
  it('rejoins only with the secret it linked with', async () => {
    const alexaId = newAlexaId();
    const showSecret = newShowSecret();
    const show = await newFamily('Echo Show');
    expect((await link(show.token, alexaId, showSecret)).status).toBe(204);

    const { token } = await rejoined(alexaId, showSecret);
    expect((await postJson('/devices/echo-show', { alexaDeviceId: alexaId })).status).toBe(400);
    expect((await rejoin(alexaId, newShowSecret())).status).toBe(404);
    // Turned away before the jar: the real Show's token still opens it.
    expect((await call(token, 'listKids')).status).toBe(200);
    expect((await rejoined(alexaId, showSecret)).familyId).toBe(show.familyId);
  });

  it("doesn't rejoin when linked without one, and a rejoin never gives it one", async () => {
    const alexaId = newAlexaId();
    const show = await newFamily('Echo Show');
    expect((await link(show.token, alexaId)).status).toBe(204);
    // As every Show linked before WJ-60.
    const showLink = env.ECHO_SHOW_LINKS.getByName(await echoShowHash(alexaId));
    await runInDurableObject(showLink, (_, state) => state.storage.delete('secretHash'));

    expect((await rejoin(alexaId, newShowSecret())).status).toBe(404);
    expect((await rejoin(alexaId)).status).toBe(404);
    const stored = await runInDurableObject(showLink, (_, state) => state.storage.list());
    expect([...stored.keys()]).toEqual(['familyId']);

    // The Show joins with a code, and its link keeps its secret.
    const again = await joinWithCode(show.token, 'Echo Show');
    expect((await link(again.token, alexaId)).status).toBe(204);
    expect((await rejoined(alexaId)).familyId).toBe(show.familyId);
  });

  it('needs a secret to link', async () => {
    const { token } = await newFamily('Echo Show');
    const linked = await postJson('/devices/echo-show/link', { alexaDeviceId: newAlexaId() }, auth(token));
    expect(linked.status).toBe(400);
  });

  it("can't be moved to another family without its secret", async () => {
    const alexaId = newAlexaId();
    const showSecret = newShowSecret();
    const home = await newFamily('Echo Show');
    await link(home.token, alexaId, showSecret);

    const stranger = await newFamily();
    expect((await link(stranger.token, alexaId, newShowSecret())).status).toBe(403);
    expect((await rejoined(alexaId, showSecret)).familyId).toBe(home.familyId);
    const marked = await runInDurableObject(env.FAMILY_JARS.getByName(stranger.familyId), (_, state) =>
      state.storage.sql.exec('SELECT id FROM devices WHERE echo_show_hash IS NOT NULL').toArray(),
    );
    expect(marked).toEqual([]);

    // The Show itself, joining another family with a code, has its secret.
    const other = await newFamily();
    const show = await joinWithCode(other.token, 'Echo Show');
    expect((await link(show.token, alexaId, showSecret)).status).toBe(204);
    expect((await rejoined(alexaId, showSecret)).familyId).toBe(other.familyId);
  });

  it('is linked again in its own family with a new secret, after the skill lost it', async () => {
    const alexaId = newAlexaId();
    const parent = await newFamily();
    const show = await joinWithCode(parent.token, 'Echo Show');
    await link(show.token, alexaId, newShowSecret());

    const newSecret = newShowSecret();
    expect((await rejoin(alexaId, newSecret)).status).toBe(404);
    const again = await joinWithCode(parent.token, 'Echo Show');
    expect((await link(again.token, alexaId, newSecret)).status).toBe(204);
    expect((await rejoined(alexaId, newSecret)).familyId).toBe(parent.familyId);
  });

  it('is free to join any family once a parent removes it', async () => {
    const alexaId = newAlexaId();
    const parent = await newFamily();
    const show = await joinWithCode(parent.token, 'Echo Show');
    await link(show.token, alexaId, newShowSecret());
    const showRow = (await devices(parent.token)).find((device) => device.label === 'Echo Show');
    await api(`/devices/${showRow?.id}`, { method: 'DELETE', headers: auth(parent.token) });
    // Even when the skill lost the secret, so no rejoin finds the row gone
    // and drops the link.
    expect((await rejoin(alexaId, newShowSecret())).status).toBe(404);

    const other = await newFamily('Echo Show');
    const newSecret = newShowSecret();
    expect((await link(other.token, alexaId, newSecret)).status).toBe(204);
    expect((await rejoined(alexaId, newSecret)).familyId).toBe(other.familyId);
  });

  it('is turned away when the secret is not one the skill could have made', async () => {
    const alexaId = newAlexaId();
    const { token } = await newFamily('Echo Show');
    expect((await link(token, alexaId, 'short')).status).toBe(400);
    expect((await link(token, alexaId, 42)).status).toBe(400);
    expect((await rejoin(alexaId, 'A'.repeat(513))).status).toBe(400);
    expect((await rejoin(alexaId, null)).status).toBe(400);
  });

  it('keeps only a hash of the secret', async () => {
    const alexaId = newAlexaId();
    const showSecret = newShowSecret();
    const { token, familyId } = await newFamily('Echo Show');
    await link(token, alexaId, showSecret);
    const showLink = env.ECHO_SHOW_LINKS.getByName(await echoShowHash(alexaId));
    const stored = await runInDurableObject(showLink, (_, state) => state.storage.list());
    expect(JSON.stringify([...stored])).not.toContain(showSecret);
    const secretHash = await echoShowSecretHash(showSecret);
    expect(Object.fromEntries(stored)).toEqual({ familyId, secretHash });
  });
});
