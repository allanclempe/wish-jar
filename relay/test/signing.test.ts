import { createExecutionContext, runInDurableObject, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fromSomewhere } from './caller';

import worker from '../src/index';
import type { CreateFamilyReply, JarApi, JarFn, PhotoUpload } from '../src/jar/api';
import { UNSIGNED_UNTIL } from '../src/signing';

const BASE = 'https://relay.example';
const APP = 'https://wish-jar.blastin.dev';
const ID = '[A-Za-z0-9_-]{43}';

// The relay with every family jar it opens noted, to tell a request turned
// away by the Worker from one that woke a jar.
let opened: string[] = [];

const watchedEnv = {
  ...env,
  FAMILY_JARS: {
    getByName(name: string) {
      opened.push(name);
      return env.FAMILY_JARS.getByName(name);
    },
  },
} as unknown as Env;

async function relay(path: string, init?: RequestInit): Promise<Response> {
  const request = fromSomewhere(new Request(path.startsWith('http') ? path : `${BASE}${path}`, init));
  const ctx = createExecutionContext();
  const response = await worker.fetch!(request as Parameters<NonNullable<typeof worker.fetch>>[0], watchedEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function bearer(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function callJar(token: string, fn: JarFn, args: unknown[] = []) {
  return relay('/jar/call', { method: 'POST', headers: bearer(token), body: JSON.stringify({ fn, args }) });
}

function jar(token: string) {
  return async <F extends JarFn>(fn: F, ...args: JarApi[F]['args']): Promise<JarApi[F]['result']> => {
    const response = await callJar(token, fn, args);
    expect(response.status, `${fn}: ${await response.clone().text()}`).toBe(200);
    return ((await response.json()) as { result: JarApi[F]['result'] }).result;
  };
}

async function newFamily(): Promise<CreateFamilyReply> {
  const response = await relay('/families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'Phone' }),
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json();
}

// The token the same device had before WJ-55: "<familyId>.<secret>".
function unsigned(token: string): string {
  return token.split('.').slice(0, 2).join('.');
}

function randomPart(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function jpeg(): Uint8Array {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

async function uploaded(token: string): Promise<string> {
  const response = await relay('/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${token}` },
    body: jpeg(),
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as PhotoUpload).url;
}

async function status(path: string): Promise<number> {
  const response = await relay(path);
  await response.arrayBuffer();
  return response.status;
}

function liveSocket(token: string) {
  return relay('/jar/live', {
    headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `wish-jar, bearer.${token}`, Origin: APP },
  });
}

// What the socket heard first: its close code, 4401 for a token turned away.
async function closeCode(response: Response): Promise<number> {
  const socket = response.webSocket!;
  const closed = new Promise<number>((resolve) => socket.addEventListener('close', (event) => resolve(event.code)));
  socket.accept();
  return closed;
}

function pastTheCutOff() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(UNSIGNED_UNTIL);
}

afterEach(() => {
  vi.useRealTimers();
  opened = [];
});

describe('device tokens are signed (WJ-55)', () => {
  it('hands out tokens with a signature over the family id and the device id', async () => {
    const { token, familyId } = await newFamily();
    expect(token).toMatch(new RegExp(`^${familyId}\\.${ID}\\.1\\.${ID}$`));
    expect(await jar(token)('listKids')).toEqual([]);
  });

  it('turns a made-up token away with 401 before waking any jar', async () => {
    const madeUp = `${randomPart()}.${randomPart()}.1.${randomPart()}`;
    opened = [];
    const call = await callJar(madeUp, 'listKids');
    expect(call.status).toBe(401);
    expect(call.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect((await relay('/devices', { headers: bearer(madeUp) })).status).toBe(401);
    expect((await relay('/devices/codes', { method: 'POST', headers: bearer(madeUp) })).status).toBe(401);
    expect((await relay('/devices/token', { method: 'POST', headers: bearer(madeUp) })).status).toBe(401);
    expect(
      (
        await relay('/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${madeUp}` },
          body: jpeg(),
        })
      ).status,
    ).toBe(401);
    expect(await closeCode(await liveSocket(madeUp))).toBe(4401);
    expect(opened).toEqual([]);
  });

  it("turns away a real family's token with its device id or signature changed", async () => {
    const { token } = await newFamily();
    const [familyId, secret, , signature] = token.split('.');
    opened = [];
    expect((await callJar(`${familyId}.${secret}.2.${signature}`, 'listKids')).status).toBe(401);
    expect((await callJar(`${familyId}.${secret}.1.${randomPart()}`, 'listKids')).status).toBe(401);
    // Another family's signature on this family's id.
    const other = (await newFamily()).token.split('.');
    opened = [];
    expect((await callJar(`${familyId}.${secret}.1.${other[3]}`, 'listKids')).status).toBe(401);
    expect(opened).toEqual([]);
  });

  it('still lets the jar turn away a signed token whose secret it does not know', async () => {
    const { token } = await newFamily();
    const [familyId, , deviceId, signature] = token.split('.');
    expect((await callJar(`${familyId}.${randomPart()}.${deviceId}.${signature}`, 'listKids')).status).toBe(401);
  });

  it('signs the tokens of joining devices and of the Echo Show', async () => {
    const parent = await newFamily();
    const codeReply = await relay('/devices/codes', { method: 'POST', headers: bearer(parent.token) });
    const { code } = (await codeReply.json()) as { code: string };
    const joinReply = await relay('/devices/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, label: 'Frame' }),
    });
    const joined = (await joinReply.json()) as CreateFamilyReply;
    expect(joined.token).toMatch(new RegExp(`^${parent.familyId}\\.${ID}\\.2\\.${ID}$`));
    expect(await jar(joined.token)('listKids')).toEqual([]);

    const alexaDeviceId = `amzn1.ask.device.${randomPart()}`;
    const link = await relay('/devices/echo-show/link', {
      method: 'POST',
      headers: bearer(joined.token),
      body: JSON.stringify({ alexaDeviceId }),
    });
    expect(link.status).toBe(204);
    const rejoinReply = await relay('/devices/echo-show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alexaDeviceId }),
    });
    const rejoined = (await rejoinReply.json()) as CreateFamilyReply;
    // The same device row, with a new secret.
    expect(rejoined.token).toMatch(new RegExp(`^${parent.familyId}\\.${ID}\\.2\\.${ID}$`));
    expect(rejoined.token).not.toBe(joined.token);
    expect(await jar(rejoined.token)('listKids')).toEqual([]);
  });

  it('opens a live socket with a signed token', async () => {
    const { token } = await newFamily();
    const response = await liveSocket(token);
    expect(response.status).toBe(101);
    expect(response.headers.get('Sec-WebSocket-Protocol')).toBe('wish-jar');
    response.webSocket!.accept();
    response.webSocket!.close();
  });
});

describe('tokens from before the signatures (WJ-55)', () => {
  it('still open the jar until the cut-off', async () => {
    const { token } = await newFamily();
    expect(await jar(unsigned(token))('listKids')).toEqual([]);
    expect((await relay('/devices', { headers: bearer(unsigned(token)) })).status).toBe(200);
  });

  it("are swapped for the device's signed token, checked by the jar", async () => {
    const { token, familyId } = await newFamily();
    const response = await relay('/devices/token', {
      method: 'POST',
      headers: { ...bearer(unsigned(token)), Origin: APP },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    // The same secret and device: the very token the device would get today.
    expect(await response.json()).toEqual({ token, familyId });

    const unknown = await relay('/devices/token', {
      method: 'POST',
      headers: bearer(`${familyId}.${randomPart()}`),
    });
    expect(unknown.status).toBe(401);
    expect((await relay('/devices/token', { headers: bearer(token) })).status).toBe(405);
  });

  it('are turned away after the cut-off without waking the jar, while signed ones still work', async () => {
    const { token } = await newFamily();
    pastTheCutOff();
    opened = [];
    expect((await callJar(unsigned(token), 'listKids')).status).toBe(401);
    expect(await closeCode(await liveSocket(unsigned(token)))).toBe(4401);
    expect(opened).toEqual([]);
    expect(await jar(token)('listKids')).toEqual([]);
  });

  it('are still swapped after the cut-off, so a device opened late keeps its family', async () => {
    const { token, familyId } = await newFamily();
    pastTheCutOff();
    const response = await relay('/devices/token', { method: 'POST', headers: bearer(unsigned(token)) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token, familyId });
  });
});

describe('photo URLs are signed (WJ-55)', () => {
  it('hands out photo URLs with a signature', async () => {
    const { token, familyId } = await newFamily();
    const url = await uploaded(token);
    expect(url).toMatch(new RegExp(`^${BASE}/photos/${familyId}/${ID}\\.jpg\\?sig=${ID}$`));
    expect(await status(url)).toBe(200);
  });

  it('answers 404 to a made-up or changed signature without waking the jar', async () => {
    const { token, familyId } = await newFamily();
    const url = new URL(await uploaded(token));
    const photoPath = url.pathname;
    const otherFamily = (await newFamily()).familyId;
    opened = [];
    expect(await status(`${photoPath}?sig=${randomPart()}`)).toBe(404);
    expect(await status(`${photoPath}?sig=short`)).toBe(404);
    // The right signature on another family's or another photo's path.
    expect(await status(`${photoPath.replace(familyId, otherFamily)}${url.search}`)).toBe(404);
    expect(await status(`/photos/${familyId}/${randomPart()}.jpg${url.search}`)).toBe(404);
    expect(await status(`/photos/${randomPart()}/${randomPart()}.jpg?sig=${randomPart()}`)).toBe(404);
    expect(opened).toEqual([]);
  });

  it('keeps one edge copy per path, whatever else the query says', async () => {
    const { token } = await newFamily();
    const url = await uploaded(token);
    expect(await status(url)).toBe(200);
    opened = [];
    expect(await status(`${url}&x=1`)).toBe(200);
    expect(await status(`${url}&x=2`)).toBe(200);
    expect(opened).toEqual([]);
  });

  it('remembers a photo the jar does not have for a while', async () => {
    const { familyId } = await newFamily();
    // Unsigned, as a URL from before WJ-55, so it gets to the jar.
    const missing = `/photos/${familyId}/${randomPart()}.jpg`;
    opened = [];
    expect(await status(missing)).toBe(404);
    expect(opened).toEqual([familyId]);
    expect(await status(missing)).toBe(404);
    expect(await status(`${missing}?x=1`)).toBe(404);
    expect(opened).toEqual([familyId]);
  });

  it('shows a photo by its URL from before WJ-55 until the cut-off, then turns it away without waking the jar', async () => {
    const { token } = await newFamily();
    const url = await uploaded(token);
    const before = new URL(url).pathname;
    expect(await status(before)).toBe(200);
    pastTheCutOff();
    opened = [];
    expect(await status(before)).toBe(404);
    expect(opened).toEqual([]);
    expect(await status(url)).toBe(200);
  });

  it("signs the URLs a jar from before WJ-55 keeps, at its next call, and leaves other families' alone", async () => {
    const { token, familyId } = await newFamily();
    const call = jar(token);
    const url = await uploaded(token);
    const old = url.replace(/\?sig=.*$/, '');
    const elsewhere = `${BASE}/photos/${randomPart()}/${randomPart()}.jpg`;
    const kidId = await call('insertKid', { name: 'Ava', photoUri: old });
    await call('insertWish', {
      kidId,
      name: 'Bike',
      coinAmount: 10,
      icon: { emoji: null, photoUri: elsewhere },
    });
    // As a jar made before this change, after a deploy.
    await runInDurableObject(env.FAMILY_JARS.getByName(familyId), (instance, state) => {
      state.storage.sql.exec("DELETE FROM jar_meta WHERE key = 'photos_signed'");
      (instance as unknown as { photosSigned: boolean }).photosSigned = false;
    });

    const [kid] = await call('listKids');
    expect(kid.photoUri).toBe(url);
    const [wish] = await call('listWishes');
    expect(wish.icon.photoUri).toBe(elsewhere);
    // The photo is still in use under its signed URL.
    const remove = await relay(new URL(url).pathname, { method: 'DELETE', headers: bearer(token) });
    expect(remove.status).toBe(409);
  });
});
