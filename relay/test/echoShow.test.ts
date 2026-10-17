import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { echoShowHash } from '../src/echoShow';
import type { CreateFamilyReply, DeviceList, JoinCode } from '../src/jar/api';
import { JAR_VERSION, jarVersion, migrateJar } from '../src/jar/schema';

const BASE = 'https://relay.example';

function relay(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return relay(path, {
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
  const codeReply = await relay('/devices/codes', { method: 'POST', headers: auth(parentToken) });
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

function link(token: string, alexaDeviceId: unknown) {
  return postJson('/devices/echo-show/link', { alexaDeviceId }, auth(token));
}

function rejoin(alexaDeviceId: unknown) {
  return postJson('/devices/echo-show', { alexaDeviceId });
}

async function rejoined(alexaDeviceId: string): Promise<CreateFamilyReply> {
  const response = await rejoin(alexaDeviceId);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}

async function devices(token: string): Promise<DeviceList['devices']> {
  const response = await relay('/devices', { headers: auth(token) });
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
    const notJson = await relay('/devices/echo-show', { method: 'POST', body: 'hello' });
    expect(notJson.status).toBe(415);
    expect((await relay('/devices/echo-show')).status).toBe(405);

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
    const removed = await relay(`/devices/${showRow?.id}`, {
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
    expect([...stored.values()]).toEqual([familyId]);
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
      expect(jarVersion(storage)).toBe(2);
    });
    const alexaId = newAlexaId();
    expect((await link(token, alexaId)).status).toBe(204);
    expect((await rejoined(alexaId)).familyId).toBe(familyId);
  });
});
