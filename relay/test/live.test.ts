import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { CreateFamilyReply, Icon, JarApi, JarChange, JarFn, JoinCode } from '../src/jar/api';
import { CALLS } from '../src/jar/calls';

const BASE = 'https://relay.example';
const APP = 'https://wish-jar.expo.app';
const DAY = '2026-10-17';
const NO_ICON: Icon = { emoji: null, photoUri: null };

function relay(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`${BASE}${path}`, init));
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

// Each join from its own IP address, so no test is slowed down by another.
let lastIp = 0;
async function joined(parentToken: string, label: string): Promise<CreateFamilyReply> {
  const codeReply = await relay('/devices/codes', { method: 'POST', headers: auth(parentToken) });
  const { code } = (await codeReply.json()) as JoinCode;
  lastIp += 1;
  const response = await relay('/devices/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${lastIp}` },
    body: JSON.stringify({ code, label }),
  });
  expect(response.status).toBe(201);
  return response.json();
}

// A call as the app makes it, from the running app `client`.
function jar(token: string, client?: string) {
  return async <F extends JarFn>(fn: F, ...args: JarApi[F]['args']): Promise<JarApi[F]['result']> => {
    const response = await relay('/jar/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify({ fn, args, client }),
    });
    expect(response.status, `${fn}: ${await response.clone().text()}`).toBe(200);
    return ((await response.json()) as { result: JarApi[F]['result'] }).result;
  };
}

function openSocket(protocols: string | null, init: { client?: string; origin?: string } = {}) {
  const query = init.client ? `?client=${init.client}` : '';
  return relay(`/jar/live${query}`, {
    headers: {
      Upgrade: 'websocket',
      ...(protocols === null ? {} : { 'Sec-WebSocket-Protocol': protocols }),
      ...(init.origin ? { Origin: init.origin } : {}),
    },
  });
}

// The close code of a socket the relay closes as soon as it opens.
async function refusedWith(response: Response): Promise<number> {
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  const closed = new Promise<number>((resolve) => socket.addEventListener('close', (event) => resolve(event.code)));
  socket.accept();
  return closed;
}

// A device's socket, with what it hears and how it closed.
type Live = {
  messages: string[];
  closed: Promise<{ code: number; reason: string }>;
  // The next message it hears, or null if none comes within a short while.
  next: () => Promise<string | null>;
  send: (message: string) => void;
};

async function live(token: string, client?: string): Promise<Live> {
  const response = await openSocket(`wish-jar, bearer.${token}`, { client, origin: APP });
  expect(response.status).toBe(101);
  expect(response.headers.get('Sec-WebSocket-Protocol')).toBe('wish-jar');
  const socket = response.webSocket!;
  socket.accept();
  const messages: string[] = [];
  let waiting: ((message: string) => void) | null = null;
  socket.addEventListener('message', (event) => {
    const message = String(event.data);
    if (waiting) {
      waiting(message);
      waiting = null;
    } else {
      messages.push(message);
    }
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    socket.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason }));
  });
  return {
    messages,
    closed,
    next: () => {
      const queued = messages.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiting = null;
          resolve(null);
        }, 300);
        waiting = (message) => {
          clearTimeout(timer);
          resolve(message);
        };
      });
    },
    send: (message) => socket.send(message),
  };
}

function tables(message: string | null): JarChange['tables'] | null {
  if (message === null) return null;
  const change = JSON.parse(message) as JarChange;
  expect(change.type).toBe('changed');
  return change.tables;
}

describe('the live socket', () => {
  it('opens for a device of the family, with the token among the protocols', async () => {
    const { token } = await newFamily();
    const socket = await live(token);
    socket.send('ping');
    expect(await socket.next()).toBe('pong');
  });

  it('closes at once for a token the jar does not know, or none', async () => {
    const { familyId } = await newFamily();
    expect(await refusedWith(await openSocket(`wish-jar, bearer.${familyId}.${'A'.repeat(43)}`))).toBe(4401);
    expect(await refusedWith(await openSocket('wish-jar'))).toBe(4401);
  });

  it('turns away other pages and plain requests', async () => {
    const { token } = await newFamily();
    expect((await openSocket(`wish-jar, bearer.${token}`, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await relay('/jar/live')).status).toBe(426);
    expect((await relay('/jar/live', { method: 'POST' })).status).toBe(405);
  });

  it("tells the family's other devices which tables a write changed", async () => {
    const phone = await newFamily();
    const frame = await joined(phone.token, 'Frame');
    const frameSocket = await live(frame.token, 'frame-app');
    const call = jar(phone.token, 'phone-app');

    const kidId = await call('insertKid', { name: 'Mia', photoUri: null });
    expect(tables(await frameSocket.next())).toEqual(['kids']);
    const taskId = await call('insertTask', { name: 'Teeth', period: 'morning', coinAmount: 2, icon: NO_ICON });
    expect(tables(await frameSocket.next())).toEqual(['tasks']);
    await call('setTaskCompletion', { kidId, taskId, dayKey: DAY, coinAmount: 2, completed: true });
    expect(tables(await frameSocket.next())).toEqual(['completions', 'kid_savings']);
    await call('setSoundEnabled', false);
    expect(tables(await frameSocket.next())).toEqual(['app_settings']);
    await call('deleteKid', kidId);
    expect(tables(await frameSocket.next())).toEqual(['kids', 'wishes', 'completions', 'kid_savings', 'consequences']);
  });

  it('tells nobody of a read, or of a write that changed nothing', async () => {
    const phone = await newFamily();
    const frameSocket = await live((await joined(phone.token, 'Frame')).token);
    const call = jar(phone.token, 'phone-app');
    const kidId = await call('insertKid', { name: 'Mia', photoUri: null });
    const taskId = await call('insertTask', { name: 'Teeth', period: 'morning', coinAmount: 2, icon: NO_ICON });
    await call('setTaskCompletion', { kidId, taskId, dayKey: DAY, coinAmount: 2, completed: true });
    expect(await frameSocket.next()).not.toBeNull();
    expect(await frameSocket.next()).not.toBeNull();
    expect(await frameSocket.next()).not.toBeNull();

    await call('listKids');
    await call('setTaskCompletion', { kidId, taskId, dayKey: DAY, coinAmount: 2, completed: true });
    await call('replacePhoto', `${BASE}/nothing.jpg`, `${BASE}/else.jpg`);
    expect(await frameSocket.next()).toBeNull();
  });

  it("doesn't send a change back to the app that made it", async () => {
    const { token } = await newFamily();
    const own = await live(token, 'tab-one');
    // Another tab of the same device still hears it.
    const otherTab = await live(token, 'tab-two');
    await jar(token, 'tab-one')('insertKid', { name: 'Mia', photoUri: null });
    expect(tables(await otherTab.next())).toEqual(['kids']);
    expect(await own.next()).toBeNull();
  });

  it("closes a removed device's socket and tells the others", async () => {
    const phone = await newFamily();
    const frame = await joined(phone.token, 'Frame');
    const tablet = await joined(phone.token, 'Tablet');
    const frameSocket = await live(frame.token);
    const tabletSocket = await live(tablet.token);

    const list = await relay('/devices', { headers: auth(phone.token) });
    const { devices } = (await list.json()) as { devices: { id: number; label: string }[] };
    const frameId = devices.find((device) => device.label === 'Frame')!.id;
    expect((await relay(`/devices/${frameId}`, { method: 'DELETE', headers: auth(phone.token) })).status).toBe(204);

    expect((await frameSocket.closed).code).toBe(4401);
    expect(tables(await tabletSocket.next())).toEqual(['devices']);
    expect(await refusedWith(await openSocket(`wish-jar, bearer.${frame.token}`))).toBe(4401);
  });

  it("closes the Echo Show's socket from its last session as it rejoins", async () => {
    const show = await newFamily('Echo Show');
    const alexaDeviceId = `amzn1.ask.device.${'B'.repeat(40)}`;
    const json = (token?: string) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? auth(token) : {}) },
      body: JSON.stringify({ alexaDeviceId }),
    });
    expect((await relay('/devices/echo-show/link', json(show.token))).status).toBe(204);
    const lastSession = await live(show.token);
    expect((await relay('/devices/echo-show', json())).status).toBe(200);
    expect((await lastSession.closed).code).toBe(4401);
  });

  it('tells the family when a device joins', async () => {
    const phone = await newFamily();
    const phoneSocket = await live(phone.token);
    await joined(phone.token, 'Frame');
    expect(tables(await phoneSocket.next())).toEqual(['devices']);
  });

  it('names the tables of every call that changes the jar', () => {
    for (const [fn, call] of Object.entries(CALLS)) {
      if (call.kind === 'read') expect(call.changes, fn).toBeUndefined();
      else expect(call.changes?.length, fn).toBeGreaterThan(0);
    }
  });
});
