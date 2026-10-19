import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fromSomewhere } from './caller';

import type { CreateFamilyReply, JoinCode } from '@wish-jar/jar';
import { UNUSED_MS } from '../src/FamilyJar';
import { callUsage, type UsageEvent } from '../src/usage';

const BASE = 'https://api.example';
const DAY_MS = 24 * 60 * 60_000;

function api(path: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(`${BASE}${path}`, init)));
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function newFamily(): Promise<CreateFamilyReply> {
  const response = await api('/families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'Phone' }),
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json();
}

async function call<T = unknown>(token: string, fn: string, ...args: unknown[]): Promise<T> {
  const response = await api('/jar/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(token) },
    body: JSON.stringify({ fn, args }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return ((await response.json()) as { result: T }).result;
}

// What the API wrote to Analytics Engine, event by event.
let written: AnalyticsEngineDataPoint[] = [];
let spy: { mockRestore(): void };

function events(): UsageEvent[] {
  return written.map((point) => point.blobs?.[0] as UsageEvent);
}

beforeEach(() => {
  written = [];
  spy = vi.spyOn(env.USAGE, 'writeDataPoint').mockImplementation((point) => {
    if (point) written.push(point);
  });
});

afterEach(() => {
  spy.mockRestore();
  vi.useRealTimers();
});

describe('usage counts', () => {
  it('writes only the event name and a count of 1', async () => {
    await newFamily();
    expect(written).toEqual([{ blobs: ['family_started'], doubles: [1], indexes: ['family_started'] }]);
  });

  it('counts a family active once a day, however many calls its devices make', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime((Math.floor(Date.now() / DAY_MS) + 3) * DAY_MS + 9 * 60 * 60_000);
    const { token } = await newFamily();
    await call(token, 'listKids');
    await call(token, 'listTasks');
    await api('/devices', { headers: auth(token) });
    expect(events()).toEqual(['family_started', 'family_active']);

    vi.setSystemTime(Date.now() + DAY_MS);
    await call(token, 'listKids');
    await call(token, 'listKids');
    expect(events()).toEqual(['family_started', 'family_active', 'family_active']);
  });

  it('counts ticks and claimed wishes that changed the jar, not un-ticks or repeats', async () => {
    const { token } = await newFamily();
    const kidId = await call<number>(token, 'insertKid', { name: 'Ava', photoUri: null });
    const icon = { emoji: '🦷', photoUri: null };
    const taskId = await call<number>(token, 'insertTask', { name: 'Teeth', period: 'morning', coinAmount: 5, icon });
    const wishId = await call<number>(token, 'insertWish', { kidId, name: 'Kite', coinAmount: 5, icon });
    const tick = (completed: boolean) =>
      call(token, 'setTaskCompletion', { kidId, taskId, dayKey: '2026-10-19', coinAmount: 5, completed });
    written = [];

    await tick(true);
    await tick(true);
    await tick(false);
    await tick(true);
    await call(token, 'claimWish', { wishId, kidId });
    await call(token, 'claimWish', { wishId, kidId });
    expect(events()).toEqual(['task_ticked', 'task_ticked', 'wish_claimed']);
  });

  it('counts a device joining and a family deleted', async () => {
    const { token } = await newFamily();
    const codeReply = await api('/devices/codes', { method: 'POST', headers: auth(token) });
    const { code } = (await codeReply.json()) as JoinCode;
    written = [];

    const join = await api('/devices/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, label: 'Frame' }),
    });
    expect(join.status).toBe(201);
    expect((await api('/families', { method: 'DELETE', headers: auth(token) })).status).toBe(204);
    expect(events()).toEqual(['device_joined', 'family_deleted']);
  });

  it('counts a family nobody came back to as expired when it deletes itself', async () => {
    const { familyId } = await newFamily();
    const jar = env.FAMILY_JARS.getByName(familyId);
    const now = Date.now();
    await runInDurableObject(jar, (_, state) => {
      state.storage.sql.exec('UPDATE devices SET created_at = ?, last_seen_at = ?', now - UNUSED_MS - 1, now - UNUSED_MS - 1);
    });
    written = [];

    expect(await runDurableObjectAlarm(jar)).toBe(true);
    expect(events()).toEqual(['family_expired']);
  });

  it("doesn't count a wish the kid is still short for, or a call turned away", async () => {
    const { token } = await newFamily();
    const kidId = await call<number>(token, 'insertKid', { name: 'Ava', photoUri: null });
    const icon = { emoji: '🪁', photoUri: null };
    const wishId = await call<number>(token, 'insertWish', { kidId, name: 'Kite', coinAmount: 50, icon });
    written = [];

    await call(token, 'claimWish', { wishId, kidId });
    const refused = await api('/jar/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify({ fn: 'setTaskCompletion', args: [{ kidId, taskId: 999, dayKey: 'x', coinAmount: 1, completed: true }] }),
    });
    expect(refused.ok).toBe(false);
    expect(events()).toEqual([]);
  });
});

describe('callUsage', () => {
  it('names the event a call counts as', () => {
    const tick = [{ kidId: 1, taskId: 1, dayKey: '2026-10-19', coinAmount: 5, completed: true }];
    expect(callUsage('setTaskCompletion', tick, { changed: true })).toBe('task_ticked');
    expect(callUsage('setTaskCompletion', tick, { changed: false })).toBeNull();
    expect(callUsage('setTaskCompletion', [{ ...tick[0], completed: false }], { changed: true })).toBeNull();
    expect(callUsage('claimWish', [{ wishId: 1, kidId: 1 }], { changed: true })).toBe('wish_claimed');
    expect(callUsage('listKids', [], [])).toBeNull();
    expect(callUsage('setTaskCompletion', null, { changed: true })).toBeNull();
  });
});
