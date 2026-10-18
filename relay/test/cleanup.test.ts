import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { echoShowHash } from '../src/echoShow';
import { PHOTO_ORIGINS } from '../src/familyPhotos';
import { ABANDONED_MS, UNUSED_MS } from '../src/FamilyJar';
import type { CreateFamilyReply, JoinCode, PhotoUpload } from '../src/jar/api';
import { fromSomewhere } from './caller';
import { purgeCalls } from './setup';

const BASE = 'https://relay.example';
const APP = 'https://wish-jar.blastin.dev';
const DAY_MS = 24 * 60 * 60_000;

function relay(path: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(`${BASE}${path}`, init)));
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

async function newFamily(label = 'Phone'): Promise<CreateFamilyReply> {
  const response = await postJson('/families', { label });
  expect(response.status).toBe(201);
  return response.json();
}

function call(token: string, fn: string, args: unknown[] = []) {
  return postJson('/jar/call', { fn, args }, auth(token));
}

function jarOf(familyId: string) {
  return env.FAMILY_JARS.getByName(familyId);
}

// Sets when the family was made and when its devices were last seen, as
// if that long ago.
async function age(familyId: string, madeAgoMs: number, seenAgoMs: number): Promise<void> {
  const now = Date.now();
  await runInDurableObject(jarOf(familyId), (_, state) => {
    state.storage.sql.exec('UPDATE devices SET created_at = ?, last_seen_at = ?', now - madeAgoMs, now - seenAgoMs);
  });
}

function alarmAt(familyId: string): Promise<number | null> {
  return runInDurableObject(jarOf(familyId), (_, state) => state.storage.getAlarm());
}

function tablesOf(familyId: string) {
  return runInDurableObject(jarOf(familyId), (_, state) =>
    state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table'").toArray(),
  );
}

describe('cleaning up families', () => {
  it('looks at a new family again once its first week is up', async () => {
    const before = Date.now();
    const { familyId } = await newFamily();
    const alarm = await alarmAt(familyId);
    expect(alarm).toBeGreaterThanOrEqual(before + UNUSED_MS);
    expect(alarm).toBeLessThanOrEqual(Date.now() + UNUSED_MS);
  });

  it('deletes a family no device came back to in its first week', async () => {
    const { token, familyId } = await newFamily();
    await call(token, 'insertKid', [{ name: 'Mia', photoUri: null }]);
    // Last seen a minute after it was made, eight days ago.
    await age(familyId, 8 * DAY_MS, 8 * DAY_MS - 60_000);
    expect(await runDurableObjectAlarm(jarOf(familyId))).toBe(true);

    expect(await tablesOf(familyId)).toEqual([]);
    expect(await alarmAt(familyId)).toBeNull();
    expect((await call(token, 'listKids')).status).toBe(401);
  });

  it('keeps a new family until its week is up', async () => {
    const { token, familyId } = await newFamily();
    await age(familyId, 3 * DAY_MS, 3 * DAY_MS);
    expect(await runDurableObjectAlarm(jarOf(familyId))).toBe(true);
    expect((await call(token, 'listKids')).status).toBe(200);
    const alarm = (await alarmAt(familyId))!;
    expect(Math.abs(alarm - (Date.now() - 3 * DAY_MS + UNUSED_MS))).toBeLessThan(60_000);
  });

  it('keeps a family a device came back to, for 6 months from when one was last seen', async () => {
    const { token, familyId } = await newFamily();
    // Made a month ago, a device seen yesterday.
    await age(familyId, 30 * DAY_MS, DAY_MS);
    expect(await runDurableObjectAlarm(jarOf(familyId))).toBe(true);
    expect((await call(token, 'listKids')).status).toBe(200);
    const alarm = (await alarmAt(familyId))!;
    expect(Math.abs(alarm - (Date.now() - DAY_MS + ABANDONED_MS))).toBeLessThan(60_000);
  });

  it('deletes a family no device has been seen in for 6 months, photos and all', async () => {
    const { token, familyId } = await newFamily();
    const upload = await relay('/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...auth(token) },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    });
    expect(upload.status).toBe(201);
    const { url } = (await upload.json()) as PhotoUpload;
    await call(token, 'insertKid', [{ name: 'Mia', photoUri: url }]);

    await age(familyId, 400 * DAY_MS, ABANDONED_MS + DAY_MS);
    expect(await runDurableObjectAlarm(jarOf(familyId))).toBe(true);
    expect(await tablesOf(familyId)).toEqual([]);
    expect((await call(token, 'listKids')).status).toBe(401);
    expect((await relay(new URL(url).pathname)).status).toBe(404);
  });

  it("purges its photos from the edge everywhere, at the relay's and the site's addresses (WJ-59)", async () => {
    const { token, familyId } = await newFamily();
    const urls: string[] = [];
    for (let i = 0; i < 2; i++) {
      const upload = await relay('/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', ...auth(token) },
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, i]),
      });
      urls.push(((await upload.json()) as PhotoUpload).url);
    }
    await call(token, 'insertKid', [{ name: 'Mia', photoUri: urls[0] }]);

    await age(familyId, 400 * DAY_MS, ABANDONED_MS + DAY_MS);
    expect(await runDurableObjectAlarm(jarOf(familyId))).toBe(true);
    const paths = PHOTO_ORIGINS.flatMap((origin) => urls.map((url) => `${origin}${new URL(url).pathname}`));
    expect(purgeCalls.flat().sort()).toEqual(paths.sort());
  });

  it('keeps a family whose device is listening, and looks again the next day', async () => {
    const { token, familyId } = await newFamily();
    const response = await relay('/jar/live', {
      headers: { Upgrade: 'websocket', Origin: APP, 'Sec-WebSocket-Protocol': `wish-jar, bearer.${token}` },
    });
    expect(response.status).toBe(101);
    response.webSocket!.accept();

    await age(familyId, 400 * DAY_MS, ABANDONED_MS + DAY_MS);
    expect(await runDurableObjectAlarm(jarOf(familyId))).toBe(true);
    expect((await tablesOf(familyId)).length).toBeGreaterThan(0);
    const alarm = (await alarmAt(familyId))!;
    expect(Math.abs(alarm - (Date.now() + DAY_MS))).toBeLessThan(60_000);
  });

  it('tells a listening device it is out when its family goes', async () => {
    const { token, familyId } = await newFamily();
    const response = await relay('/jar/live', {
      headers: { Upgrade: 'websocket', Origin: APP, 'Sec-WebSocket-Protocol': `wish-jar, bearer.${token}` },
    });
    const socket = response.webSocket!;
    socket.accept();
    const closed = new Promise<number>((resolve) => socket.addEventListener('close', (event) => resolve(event.code)));
    // An open socket keeps the family alive, so the alarm never deletes one
    // with a socket open; this is the deletion it runs, called directly.
    await runInDurableObject(jarOf(familyId), async (instance) => {
      await (instance as unknown as { deleteFamily(): Promise<void> }).deleteFamily();
    });
    expect(await closed).toBe(4401);
    expect(await tablesOf(familyId)).toEqual([]);
  });

  it("drops its Echo Show's link, so the Show finds no family", async () => {
    const alexaDeviceId = `amzn1.ask.device.${crypto.randomUUID()}`;
    const { token, familyId } = await newFamily('Echo Show');
    expect((await postJson('/devices/echo-show/link', { alexaDeviceId }, auth(token))).status).toBe(204);
    const hash = await echoShowHash(alexaDeviceId);

    await age(familyId, 400 * DAY_MS, ABANDONED_MS + DAY_MS);
    expect(await runDurableObjectAlarm(jarOf(familyId))).toBe(true);
    const link = await runInDurableObject(env.ECHO_SHOW_LINKS.getByName(hash), (_, state) => state.storage.list());
    expect(link.size).toBe(0);
    expect((await postJson('/devices/echo-show', { alexaDeviceId })).status).toBe(404);
  });

  it("turns away a join code for a family that's gone", async () => {
    const { token, familyId } = await newFamily();
    const codeReply = await relay('/devices/codes', { method: 'POST', headers: auth(token) });
    const { code } = (await codeReply.json()) as JoinCode;
    await age(familyId, 8 * DAY_MS, 8 * DAY_MS);
    expect(await runDurableObjectAlarm(jarOf(familyId))).toBe(true);
    expect((await postJson('/devices/join', { code, label: 'Tablet' })).status).toBe(410);
  });

  it("gives a family from before the cleanup its alarm when it's next opened", async () => {
    const { token, familyId } = await newFamily();
    await runInDurableObject(jarOf(familyId), (_, state) => state.storage.deleteAlarm());
    expect(await alarmAt(familyId)).toBeNull();
    // A new instance of the object, as after a deploy.
    await evictDurableObject(jarOf(familyId));
    const opened = Date.now();
    expect((await call(token, 'listKids')).status).toBe(200);
    // Set for when it's next due (the end of its first week), rather than
    // run straight away.
    const alarm = (await alarmAt(familyId))!;
    expect(alarm).not.toBeNull();
    expect(Math.abs(alarm - (opened + UNUSED_MS))).toBeLessThan(60_000);
  });
});
