import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fromSomewhere } from './caller';

import type { CreateFamilyReply, JarApi, JarFn } from '@wish-jar/jar';
import { DAILY_WRITES, DailyWrites } from '../src/jar/dailyWrites';

const BASE = 'https://api.example';
const APP = 'https://wish-jar.blastin.dev';
const DAY_MS = 24 * 60 * 60_000;
// 20:00 UTC, 4 hours before the family's budget starts again, on a day still
// to come: the alarms set meanwhile (the per-caller limits') don't go off
// while the tests run.
const DAY_NUMBER = Math.floor(Date.now() / DAY_MS) + 2;
const EVENING = DAY_NUMBER * DAY_MS + 20 * 60 * 60_000;
const UNTIL_MIDNIGHT_S = 4 * 60 * 60;
const DAY = new Date(EVENING).toISOString().slice(0, 10);
const NEXT_DAY = new Date(EVENING + DAY_MS).toISOString().slice(0, 10);

function api(path: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(`${BASE}${path}`, init)));
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

function post(token: string, fn: JarFn, ...args: unknown[]) {
  return api('/jar/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: APP },
    body: JSON.stringify({ fn, args }),
  });
}

function jar(token: string) {
  return async <F extends JarFn>(fn: F, ...args: JarApi[F]['args']): Promise<JarApi[F]['result']> => {
    const response = await post(token, fn, ...args);
    expect(response.status, `${fn}: ${await response.clone().text()}`).toBe(200);
    return ((await response.json()) as { result: JarApi[F]['result'] }).result;
  };
}

function upload(token: string, size = 64) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes.subarray(0, Math.min(size, 65536)));
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return api('/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${token}`, Origin: APP },
    body: bytes,
  });
}

function stub(familyId: string) {
  return env.FAMILY_JARS.getByName(familyId);
}

// The count the jar keeps for today, or null.
function kept(familyId: string) {
  return runInDurableObject(stub(familyId), (_, state) => {
    const row = state.storage.sql
      .exec<{ value: string }>("SELECT value FROM jar_meta WHERE key = 'daily_writes'")
      .toArray()[0];
    return row ? (JSON.parse(row.value) as { day: number; rows: number; bytes: number }) : null;
  });
}

// The family as if it had written this much today, and its jar has just
// woken up, so it counts from what's kept.
function alreadyWrote(familyId: string, rows: number, bytes = 0) {
  return runInDurableObject(stub(familyId), (instance, state) => {
    state.storage.sql.exec(
      "INSERT INTO jar_meta (key, value) VALUES ('daily_writes', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      JSON.stringify({ day: DAY_NUMBER, rows, bytes }),
    );
    (instance as unknown as { writes: DailyWrites }).writes = new DailyWrites(state.storage);
  });
}

async function newJarWithTask() {
  const family = await newFamily();
  const call = jar(family.token);
  const kidId = await call('insertKid', { name: 'Ava', photoUri: null });
  const taskId = await call('insertTask', {
    name: 'Brush teeth',
    period: 'morning',
    coinAmount: 5,
    icon: { emoji: '🪥', photoUri: null },
  });
  return { ...family, call, kidId, taskId };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("a family's daily write budget", () => {
  it('counts the rows writes write, and nothing for reads', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const { familyId, call, kidId, taskId } = await newJarWithTask();
    const before = (await kept(familyId))!;
    expect(before.day).toBe(DAY_NUMBER);

    await call('listKids');
    await call('getKidSavings', kidId);
    expect(await kept(familyId)).toEqual(before);

    // A tick is a few rows, so a real family is nowhere near the budget.
    const add = vi.spyOn(DailyWrites.prototype, 'add');
    await call('setTaskCompletion', { kidId, taskId, dayKey: DAY, coinAmount: 5, completed: true });
    expect(add).toHaveBeenCalledOnce();
    const [, rows, bytes] = add.mock.calls[0];
    add.mockRestore();
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(10);
    expect(bytes).toBe(0);
  });

  it('turns writes and uploads away until 00:00 UTC once the rows are used up, reads still answered', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const { familyId, token, call, kidId, taskId } = await newJarWithTask();
    await alreadyWrote(familyId, DAILY_WRITES.rows);

    const tick = await post(token, 'setTaskCompletion', { kidId, taskId, dayKey: DAY, coinAmount: 5, completed: true });
    expect(tick.status).toBe(429);
    expect(Number(tick.headers.get('Retry-After'))).toBe(UNTIL_MIDNIGHT_S);
    // Readable by Wish Jar's pages, which say how long to wait.
    expect(tick.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(tick.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect((await post(token, 'deleteTask', taskId)).status).toBe(429);
    const photo = await upload(token);
    expect(photo.status).toBe(429);
    expect(Number(photo.headers.get('Retry-After'))).toBe(UNTIL_MIDNIGHT_S);

    expect(await call('listCompletedTaskIds', kidId, DAY)).toEqual([]);
    expect(await call('listTasks')).toHaveLength(1);

    // A new UTC day, a new budget.
    vi.setSystemTime(EVENING + UNTIL_MIDNIGHT_S * 1000);
    await call('setTaskCompletion', { kidId, taskId, dayKey: NEXT_DAY, coinAmount: 5, completed: true });
    expect(await call('listCompletedTaskIds', kidId, NEXT_DAY)).toEqual([taskId]);
  });

  it('lets the write that reaches the budget through, then none', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const { familyId, token, call } = await newJarWithTask();
    await alreadyWrote(familyId, DAILY_WRITES.rows - 1);
    await call('insertKid', { name: 'Ben', photoUri: null });
    expect((await post(token, 'insertKid', { name: 'Cleo', photoUri: null })).status).toBe(429);
  });

  it('counts the bytes of photos going up, uploaded or as data: URIs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const { familyId, token } = await newJarWithTask();
    expect((await upload(token, 2048)).status).toBe(201);
    expect((await kept(familyId))!.bytes).toBeGreaterThanOrEqual(2048);

    await alreadyWrote(familyId, 0, DAILY_WRITES.bytes);
    const refused = await upload(token);
    expect(refused.status, await refused.text()).toBe(429);
    const photoUri = `data:image/jpeg;base64,${btoa('\xff\xd8\xff\xe0 a photo')}`;
    expect((await post(token, 'insertKid', { name: 'Ben', photoUri })).status).toBe(429);
  });

  it('keeps the count a step ahead, so a jar that sleeps never gets budget back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const { familyId } = await newFamily();
    await runInDurableObject(stub(familyId), (_, state) => {
      const awake = new DailyWrites(state.storage);
      awake.add(EVENING, 3, 0);
      const written = state.storage.sql.exec("SELECT value FROM jar_meta WHERE key = 'daily_writes'").toArray();
      // Kept once, ahead of the count: the next few writes keep nothing.
      awake.add(EVENING, 3, 0);
      expect(state.storage.sql.exec("SELECT value FROM jar_meta WHERE key = 'daily_writes'").toArray()).toEqual(
        written,
      );

      awake.add(EVENING, DAILY_WRITES.rows - 10, 0);
      expect(awake.wait(EVENING)).toBeNull();
      // Woken up again: counted from the kept count, which is past the budget.
      const woken = new DailyWrites(state.storage);
      expect(woken.wait(EVENING)).toBe(UNTIL_MIDNIGHT_S);
    });
    const count = (await kept(familyId))!;
    expect(count.rows).toBeGreaterThanOrEqual(DAILY_WRITES.rows);
    expect(count.bytes).toBe(0);
  });
});
