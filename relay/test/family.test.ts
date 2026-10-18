import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { fromSomewhere } from './caller';

import type * as App from '../../src/db/types';
import type * as Jar from '../src/jar/api';
import type { CreateFamilyReply, Icon, JarApi, JarFn, JarImport } from '../src/jar/api';
import { MAX_JAR_BYTES } from '../src/jar/limits';

// The jar answers with the app's own types, so WJ-47 can swap src/db for calls
// here without touching the screens. Checked by the typecheck.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameTypes: [
  Same<App.Kid, Jar.Kid>,
  Same<App.Task, Jar.Task>,
  Same<App.ConsequenceType, Jar.ConsequenceType>,
  Same<App.Consequence, Jar.Consequence>,
  Same<App.Wish, Jar.Wish>,
] = [true, true, true, true, true];
void sameTypes;

const BASE = 'https://relay.example';
const APP = 'https://wish-jar.blastin.dev';
const DAY = '2026-10-17';
const NO_ICON: Icon = { emoji: null, photoUri: null };

function relay(path: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(`${BASE}${path}`, init)));
}

function createFamily(body?: unknown, headers: Record<string, string> = {}) {
  return relay('/families', {
    method: 'POST',
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function newFamily(body?: unknown): Promise<CreateFamilyReply> {
  const response = await createFamily(body);
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json();
}

function post(token: string | null, body: unknown, headers: Record<string, string> = {}) {
  return relay('/jar/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// A typed client like the one the app will have.
function jar(token: string) {
  return async <F extends JarFn>(fn: F, ...args: JarApi[F]['args']): Promise<JarApi[F]['result']> => {
    const response = await post(token, { fn, args });
    expect(response.status, `${fn}: ${await response.clone().text()}`).toBe(200);
    return ((await response.json()) as { result: JarApi[F]['result'] }).result;
  };
}

async function newJar() {
  const family = await newFamily();
  return { ...family, call: jar(family.token) };
}

function stub(familyId: string) {
  return env.FAMILY_JARS.getByName(familyId);
}

describe('creating a family', () => {
  it('hands out a family id and a device token made of it', async () => {
    const { token, familyId } = await newFamily();
    expect(familyId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).toMatch(new RegExp(`^${familyId}\\.[A-Za-z0-9_-]{43}$`));
  });

  it('keeps only a hash of the secret, with the device label', async () => {
    const { token, familyId } = await newFamily({ label: '  Kitchen frame ' });
    const secret = token.split('.')[1];
    const devices = await runInDurableObject(stub(familyId), (_, state) =>
      state.storage.sql.exec('SELECT * FROM devices').toArray(),
    );
    expect(devices).toHaveLength(1);
    expect(devices[0].label).toBe('Kitchen frame');
    expect(devices[0].secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(devices)).not.toContain(secret);
  });

  it('starts a new family with the starter consequence types and nothing else', async () => {
    const { call } = await newJar();
    const types = await call('listConsequenceTypes');
    expect(types.map((type) => type.name)).toEqual([
      'Give a hug',
      'Say sorry',
      'Tidy up the mess',
      'Write a sorry note',
      'Make up with a brother or sister',
      'Told a lie',
      'Too much screen time',
      'Not in bed on time',
      'Hurt someone',
    ]);
    expect(await call('listKids')).toEqual([]);
    expect(await call('listTasks')).toEqual([]);
    expect(await call('listWishes')).toEqual([]);
  });

  it('turns away a body that is not JSON or not an object', async () => {
    const notJson = await relay('/families', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    expect(notJson.status).toBe(415);
    expect((await createFamily([])).status).toBe(400);
    expect((await createFamily({ label: 7 })).status).toBe(400);
    expect((await createFamily({ label: 'x'.repeat(61) })).status).toBe(400);
    const broken = await relay('/families', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(broken.status).toBe(400);
  });

  it('only takes POST', async () => {
    expect((await relay('/families')).status).toBe(405);
    expect((await relay('/jar/call')).status).toBe(405);
  });
});

describe('device tokens', () => {
  it('opens the jar with a good token', async () => {
    const { call } = await newJar();
    expect(await call('getParentPin')).toBe('000');
  });

  it('turns away a missing, malformed or wrong token', async () => {
    const { token } = await newFamily();
    const [familyId, secret] = token.split('.');
    const body = { fn: 'listKids', args: [] };
    const otherSecret = (await newFamily()).token.split('.')[1];

    for (const bad of [
      null,
      'nonsense',
      familyId,
      `${familyId}.`,
      `${familyId}.${secret}x`,
      `${familyId}.${otherSecret}`,
    ]) {
      const response = await post(bad, body);
      expect(response.status, String(bad)).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    }
  });

  it("doesn't open another family's jar, or a family that doesn't exist", async () => {
    const one = await newFamily();
    const two = await newFamily();
    const secretOne = one.token.split('.')[1];
    expect((await post(`${two.familyId}.${secretOne}`, { fn: 'listKids', args: [] })).status).toBe(401);

    const nobody = 'A'.repeat(43);
    expect((await post(`${nobody}.${secretOne}`, { fn: 'listKids', args: [] })).status).toBe(401);
    // Knocking on an unknown family leaves nothing behind.
    const tables = await runInDurableObject(stub(nobody), (_, state) =>
      state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table'").toArray(),
    );
    expect(tables.filter((table) => !String(table.name).startsWith('_cf'))).toEqual([]);
  });

  it('notes when a device was last seen', async () => {
    const { token, familyId } = await newFamily();
    await runInDurableObject(stub(familyId), (_, state) => {
      state.storage.sql.exec('UPDATE devices SET last_seen_at = 0');
    });
    await jar(token)('listKids');
    const [device] = await runInDurableObject(stub(familyId), (_, state) =>
      state.storage.sql.exec<{ last_seen_at: number }>('SELECT last_seen_at FROM devices').toArray(),
    );
    expect(Date.now() - device.last_seen_at).toBeLessThan(60_000);
  });
});

describe('calls', () => {
  it('refuses unknown functions and wrong arguments', async () => {
    const { token } = await newFamily();
    for (const body of [
      { fn: 'dropEverything', args: [] },
      { fn: 'constructor', args: [] },
      { fn: 'addToSavings', args: [1, 5] },
      { fn: 'listKids' },
      { fn: 'getKid', args: [] },
      { fn: 'getKid', args: ['1'] },
      { fn: 'getKid', args: [1.5] },
      { fn: 'getKid', args: [0] },
      { args: [] },
      [],
    ]) {
      expect((await post(token, body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('wants JSON', async () => {
    const { token } = await newFamily();
    const response = await post(token, { fn: 'listKids', args: [] }, { 'Content-Type': 'text/plain' });
    expect(response.status).toBe(415);
  });

  it('turns away a body that is too big', async () => {
    const { token } = await newFamily();
    const photo = 'x'.repeat(5 * 1024 * 1024);
    const response = await post(token, { fn: 'insertKid', args: [{ name: 'Ava', photoUri: photo }] });
    expect(response.status).toBe(413);
  });
});

describe('kids', () => {
  it('adds, reads, edits and lists kids', async () => {
    const { call } = await newJar();
    const ava = await call('insertKid', { name: '  Ava ', photoUri: 'file:///ava.jpg' });
    const ben = await call('insertKid', { name: 'Ben', photoUri: null });
    expect(typeof ava).toBe('number');

    const kid = await call('getKid', ava);
    expect(kid).toMatchObject({ id: ava, name: 'Ava', photoUri: 'file:///ava.jpg' });
    expect(typeof kid?.createdAt).toBe('number');
    expect(await call('getKid', 999)).toBeNull();

    expect(await call('updateKid', ava, { name: 'Ava Rose', photoUri: 'file:///new.jpg' })).toBe(
      'file:///ava.jpg',
    );
    expect(await call('setKidPhoto', ava, null)).toBe('file:///new.jpg');
    expect(await call('setKidPhoto', ben, 'data:image/jpeg;base64,AAAA')).toBeNull();
    expect((await call('listKids')).map((k) => [k.id, k.name, k.photoUri])).toEqual([
      [ava, 'Ava Rose', null],
      [ben, 'Ben', 'data:image/jpeg;base64,AAAA'],
    ]);
  });

  it('checks names', async () => {
    const { token } = await newFamily();
    for (const name of ['', '   ', 'x'.repeat(101), 5, null]) {
      const response = await post(token, { fn: 'insertKid', args: [{ name, photoUri: null }] });
      expect(response.status, String(name)).toBe(400);
    }
  });

  it("takes the kid's wishes, ticks, consequences and savings with them", async () => {
    const { call, familyId } = await newJar();
    const ava = await call('insertKid', { name: 'Ava', photoUri: 'file:///ava.jpg' });
    const ben = await call('insertKid', { name: 'Ben', photoUri: null });
    const task = await call('insertTask', { name: 'Make bed', period: 'morning', coinAmount: 2, icon: NO_ICON });
    await call('insertWish', {
      kidId: ava,
      name: 'Bike',
      coinAmount: 50,
      icon: { emoji: null, photoUri: 'file:///bike.jpg' },
    });
    await call('insertWish', { kidId: ben, name: 'Lego', coinAmount: 10, icon: NO_ICON });
    for (const kidId of [ava, ben]) {
      await call('setTaskCompletion', { kidId, taskId: task, dayKey: DAY, coinAmount: 2, completed: true });
    }
    const [type] = await call('listConsequenceTypes');
    await call('addConsequence', { kidId: ava, consequenceType: type, dayKey: DAY });

    expect((await call('deleteKid', ava)).sort()).toEqual(['file:///ava.jpg', 'file:///bike.jpg']);

    const left = await runInDurableObject(stub(familyId), (_, state) =>
      ['wishes', 'completions', 'consequences', 'kid_savings'].map(
        (table) => state.storage.sql.exec(`SELECT COUNT(*) AS n FROM ${table} WHERE kid_id = ?`, ava).one().n,
      ),
    );
    expect(left).toEqual([0, 0, 0, 0]);
    expect(await call('getKidSavings', ben)).toBe(2);
    expect(await call('listWishes')).toHaveLength(1);
  });
});

describe('tasks', () => {
  it('adds, reads, edits and deletes tasks', async () => {
    const { call } = await newJar();
    const icon = { emoji: '🪥', photoUri: 'file:///teeth.jpg' };
    const id = await call('insertTask', { name: 'Brush teeth', period: 'morning', coinAmount: 1, icon });
    expect(await call('getTask', id)).toMatchObject({
      id,
      name: 'Brush teeth',
      period: 'morning',
      coinAmount: 1,
      icon,
    });
    expect(
      await call('updateTask', id, { name: 'Teeth', period: 'evening', coinAmount: 3, icon: NO_ICON }),
    ).toBe('file:///teeth.jpg');
    expect(await call('listTasks')).toMatchObject([
      { id, name: 'Teeth', period: 'evening', coinAmount: 3, icon: NO_ICON },
    ]);
    expect(await call('deleteTask', id)).toBeNull();
    expect(await call('deleteTask', id)).toBeNull();
    expect(await call('listTasks')).toEqual([]);
  });

  it('checks periods, coins and icons', async () => {
    const { token } = await newFamily();
    const good = { name: 'Shower', period: 'evening', coinAmount: 1, icon: NO_ICON };
    for (const input of [
      { ...good, period: 'night' },
      { ...good, coinAmount: -1 },
      { ...good, coinAmount: 1_000_000 },
      { ...good, coinAmount: 1.5 },
      { ...good, coinAmount: '1' },
      { ...good, icon: null },
      { ...good, icon: { emoji: 'x'.repeat(33), photoUri: null } },
      { ...good, icon: { emoji: null, photoUri: 'x'.repeat(1024 * 1024 + 1) } },
    ]) {
      expect((await post(token, { fn: 'insertTask', args: [input] })).status, JSON.stringify(input).slice(0, 80)).toBe(
        400,
      );
    }
    expect((await post(token, { fn: 'insertTask', args: [good] })).status).toBe(200);
  });

  it("keeps the coins a deleted task's ticks earned", async () => {
    const { call } = await newJar();
    const kidId = await call('insertKid', { name: 'Ava', photoUri: null });
    const taskId = await call('insertTask', { name: 'Shower', period: 'evening', coinAmount: 4, icon: NO_ICON });
    await call('setTaskCompletion', { kidId, taskId, dayKey: DAY, coinAmount: 4, completed: true });
    await call('deleteTask', taskId);
    expect(await call('listCompletedTaskIds', kidId, DAY)).toEqual([]);
    expect(await call('getKidSavings', kidId)).toBe(4);
  });
});

describe('ticks and savings', () => {
  async function kidWithTask(coinAmount = 3) {
    const jarCall = await newJar();
    const kidId = await jarCall.call('insertKid', { name: 'Ava', photoUri: null });
    const taskId = await jarCall.call('insertTask', { name: 'Make bed', period: 'morning', coinAmount, icon: NO_ICON });
    return { ...jarCall, kidId, taskId };
  }

  it('adds the coins once and takes back exactly the same', async () => {
    const { call, kidId, taskId } = await kidWithTask(3);
    const tick = { kidId, taskId, dayKey: DAY, coinAmount: 3, completed: true };

    expect(await call('setTaskCompletion', tick)).toEqual({ changed: true, coins: 3, savings: 3 });
    expect(await call('setTaskCompletion', tick)).toEqual({ changed: false, coins: 0, savings: 3 });
    expect(await call('listCompletedTaskIds', kidId, DAY)).toEqual([taskId]);
    expect(await call('listCompletedTaskIds', kidId, '2026-10-18')).toEqual([]);
    expect(await call('sumCoinsEarnedOn', kidId, DAY)).toBe(3);

    // The parent changes the coins: un-ticking still takes back what was added.
    await call('updateTask', taskId, { name: 'Make bed', period: 'morning', coinAmount: 10, icon: NO_ICON });
    const untick = { ...tick, completed: false };
    expect(await call('setTaskCompletion', untick)).toEqual({ changed: true, coins: 3, savings: 0 });
    expect(await call('setTaskCompletion', untick)).toEqual({ changed: false, coins: 0, savings: 0 });
    expect(await call('sumCoinsEarnedOn', kidId, DAY)).toBe(0);
  });

  it("adds the task's coins as the jar has them, not as the device says", async () => {
    const { call, kidId, taskId } = await kidWithTask(3);
    const change = await call('setTaskCompletion', {
      kidId,
      taskId,
      dayKey: DAY,
      coinAmount: 999,
      completed: true,
    });
    expect(change).toEqual({ changed: true, coins: 3, savings: 3 });
  });

  it("changes nothing for a task that isn't there, and refuses a kid that isn't", async () => {
    const { call, token, kidId, taskId } = await kidWithTask();
    expect(
      await call('setTaskCompletion', { kidId, taskId: 999, dayKey: DAY, coinAmount: 3, completed: true }),
    ).toEqual({ changed: false, coins: 0, savings: 0 });
    const response = await post(token, {
      fn: 'setTaskCompletion',
      args: [{ kidId: 999, taskId, dayKey: DAY, coinAmount: 3, completed: true }],
    });
    expect(response.status).toBe(400);
  });

  it('keeps the tick and the savings together when a write fails halfway', async () => {
    const { call, token, familyId, kidId, taskId } = await kidWithTask(3);
    // Savings that refuse to change make the tick's second statement fail.
    await runInDurableObject(stub(familyId), (_, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER no_savings BEFORE INSERT ON kid_savings
        BEGIN SELECT RAISE(ABORT, 'no savings'); END
      `);
    });
    const tick = { kidId, taskId, dayKey: DAY, coinAmount: 3, completed: true };
    expect((await post(token, { fn: 'setTaskCompletion', args: [tick] })).status).toBe(400);
    await runInDurableObject(stub(familyId), (_, state) => {
      state.storage.sql.exec('DROP TRIGGER no_savings');
    });

    expect(await call('listCompletedTaskIds', kidId, DAY)).toEqual([]);
    expect(await call('getKidSavings', kidId)).toBe(0);
    expect(await call('setTaskCompletion', tick)).toEqual({ changed: true, coins: 3, savings: 3 });
  });

  it('gives bonus coins from 1 to 999', async () => {
    const { call, token, kidId } = await kidWithTask();
    expect(await call('giveBonusCoins', { kidId, coins: 5 })).toBeNull();
    expect(await call('giveBonusCoins', { kidId, coins: 999 })).toBeNull();
    expect(await call('getKidSavings', kidId)).toBe(1004);
    for (const coins of [0, -5, 1000, 2.5]) {
      expect((await post(token, { fn: 'giveBonusCoins', args: [{ kidId, coins }] })).status).toBe(400);
    }
  });

  it('checks day keys', async () => {
    const { token, kidId } = await kidWithTask();
    for (const dayKey of ['17/10/2026', '2026-10-17T00:00', '', 20261017]) {
      expect((await post(token, { fn: 'listCompletedTaskIds', args: [kidId, dayKey] })).status).toBe(400);
    }
  });
});

describe('consequences', () => {
  async function kidWithSavings(savings: number) {
    const jarCall = await newJar();
    const kidId = await jarCall.call('insertKid', { name: 'Ava', photoUri: null });
    await jarCall.call('giveBonusCoins', { kidId, coins: savings });
    return { ...jarCall, kidId };
  }

  it('adds, edits and deletes consequence types', async () => {
    const { call } = await newJar();
    const icon = { emoji: '🧦', photoUri: 'file:///socks.jpg' };
    const id = await call('insertConsequenceType', { name: 'Socks on floor', coinAmount: 1, icon });
    expect(await call('getConsequenceType', id)).toMatchObject({ id, name: 'Socks on floor', coinAmount: 1, icon });
    expect(await call('updateConsequenceType', id, { name: 'Socks', coinAmount: 0, icon: NO_ICON })).toBe(
      'file:///socks.jpg',
    );
    expect(await call('deleteConsequenceType', id)).toBeNull();
    expect(await call('getConsequenceType', id)).toBeNull();
  });

  it("takes the type's coins as the jar has them, and gives them back the same day", async () => {
    const { call, kidId } = await kidWithSavings(10);
    const typeId = await call('insertConsequenceType', { name: 'Told a fib', coinAmount: 3, icon: NO_ICON });
    const stale = { id: typeId, name: 'Old name', coinAmount: 1, icon: NO_ICON, createdAt: 0 };

    expect(await call('addConsequence', { kidId, consequenceType: stale, dayKey: DAY })).toEqual({
      changed: true,
      coins: 3,
    });
    expect(await call('getKidSavings', kidId)).toBe(7);
    const [logged] = await call('listConsequences', kidId, DAY);
    expect(logged).toMatchObject({ kidId, consequenceTypeId: typeId, name: 'Told a fib', coinAmount: 3, dayKey: DAY });
    expect(await call('listConsequences', kidId, '2026-10-16')).toEqual([]);

    // Another day: the deduction stands.
    expect(
      await call('removeConsequence', { consequenceId: logged.id, kidId, dayKey: '2026-10-18' }),
    ).toEqual({ changed: false, coins: 0 });
    expect(await call('getKidSavings', kidId)).toBe(7);

    expect(await call('removeConsequence', { consequenceId: logged.id, kidId, dayKey: DAY })).toEqual({
      changed: true,
      coins: 3,
    });
    expect(await call('removeConsequence', { consequenceId: logged.id, kidId, dayKey: DAY })).toEqual({
      changed: false,
      coins: 0,
    });
    expect(await call('getKidSavings', kidId)).toBe(10);
  });

  it('can take a kid below zero', async () => {
    const { call, kidId } = await kidWithSavings(1);
    const typeId = await call('insertConsequenceType', { name: 'Hurt someone', coinAmount: 5, icon: NO_ICON });
    await call('addConsequence', {
      kidId,
      consequenceType: { id: typeId, name: '', coinAmount: 0, icon: NO_ICON, createdAt: 0 },
      dayKey: DAY,
    });
    expect(await call('getKidSavings', kidId)).toBe(-4);
  });

  it('logs nothing for a deleted type, and keeps logged entries when a type goes', async () => {
    const { call, kidId } = await kidWithSavings(10);
    const typeId = await call('insertConsequenceType', {
      name: 'Too much screen time',
      coinAmount: 2,
      icon: { emoji: '📱', photoUri: null },
    });
    const type = (await call('getConsequenceType', typeId))!;
    await call('addConsequence', { kidId, consequenceType: type, dayKey: DAY });
    await call('deleteConsequenceType', typeId);

    expect(await call('listConsequences', kidId, DAY)).toMatchObject([
      { consequenceTypeId: null, name: 'Too much screen time', coinAmount: 2, icon: NO_ICON },
    ]);
    expect(await call('addConsequence', { kidId, consequenceType: type, dayKey: DAY })).toEqual({
      changed: false,
      coins: 0,
    });
    expect(await call('getKidSavings', kidId)).toBe(8);
  });
});

describe('wishes', () => {
  it('adds, edits, moves and deletes wishes', async () => {
    const { call } = await newJar();
    const ava = await call('insertKid', { name: 'Ava', photoUri: null });
    const ben = await call('insertKid', { name: 'Ben', photoUri: null });
    const icon = { emoji: '🚲', photoUri: 'file:///bike.jpg' };
    const id = await call('insertWish', { kidId: ava, name: 'Bike', coinAmount: 120, icon });
    expect(await call('getWish', id)).toMatchObject({
      id,
      kidId: ava,
      name: 'Bike',
      coinAmount: 120,
      icon,
      claimedAt: null,
    });
    expect(await call('updateWish', id, { kidId: ben, name: 'Red bike', coinAmount: 150, icon: NO_ICON })).toBe(
      'file:///bike.jpg',
    );
    expect(await call('listWishes')).toMatchObject([{ id, kidId: ben, name: 'Red bike', coinAmount: 150 }]);
    expect(await call('deleteWish', id)).toBeNull();
    expect(await call('getWish', id)).toBeNull();
  });

  it("refuses a wish for a kid that isn't there", async () => {
    const { token } = await newFamily();
    const response = await post(token, {
      fn: 'insertWish',
      args: [{ kidId: 42, name: 'Bike', coinAmount: 1, icon: NO_ICON }],
    });
    expect(response.status).toBe(400);
  });

  it("claims a wish once, and never past the kid's savings", async () => {
    const { call } = await newJar();
    const kidId = await call('insertKid', { name: 'Ava', photoUri: null });
    const wishId = await call('insertWish', { kidId, name: 'Lego', coinAmount: 20, icon: NO_ICON });
    await call('giveBonusCoins', { kidId, coins: 19 });

    expect(await call('claimWish', { wishId, kidId })).toEqual({ changed: false, coins: 0 });
    expect(await call('getKidSavings', kidId)).toBe(19);

    await call('giveBonusCoins', { kidId, coins: 6 });
    // Two devices claim at the same moment: only one takes the coins.
    const claims = await Promise.all([
      call('claimWish', { wishId, kidId }),
      call('claimWish', { wishId, kidId }),
    ]);
    expect(claims.filter((claim) => claim.changed)).toEqual([{ changed: true, coins: 20 }]);
    expect(await call('getKidSavings', kidId)).toBe(5);
    expect((await call('getWish', wishId))?.claimedAt).toEqual(expect.any(Number));

    const other = await call('insertKid', { name: 'Ben', photoUri: null });
    const bens = await call('insertWish', { kidId: other, name: 'Ball', coinAmount: 0, icon: NO_ICON });
    expect(await call('claimWish', { wishId: bens, kidId })).toEqual({ changed: false, coins: 0 });
  });
});

describe('settings', () => {
  it('has defaults and keeps what is set', async () => {
    const { call, token } = await newJar();
    expect(await call('getActiveKidId')).toBeNull();
    expect(await call('getParentPin')).toBe('000');
    expect(await call('getSoundEnabled')).toBe(true);

    const kidId = await call('insertKid', { name: 'Ava', photoUri: null });
    expect(await call('setActiveKidId', kidId)).toBeNull();
    await call('setParentPin', '427');
    await call('setSoundEnabled', false);
    expect(await call('getActiveKidId')).toBe(kidId);
    expect(await call('getParentPin')).toBe('427');
    expect(await call('getSoundEnabled')).toBe(false);

    for (const pin of ['42', '4271', 'abc', 427]) {
      expect((await post(token, { fn: 'setParentPin', args: [pin] })).status).toBe(400);
    }
    expect((await post(token, { fn: 'setSoundEnabled', args: ['no'] })).status).toBe(400);
  });

  it('is shared by every device of the family', async () => {
    const { call, familyId } = await newJar();
    await call('setParentPin', '123');
    // A second device, as joining (WJ-48) will add one.
    const secret = 'B'.repeat(43);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    await runInDurableObject(stub(familyId), (_, state) => {
      state.storage.sql.exec('INSERT INTO devices (secret_hash, label) VALUES (?, ?)', hash, 'Echo Show');
    });
    expect(await jar(`${familyId}.${secret}`)('getParentPin')).toBe('123');
  });
});

describe('importing a jar', () => {
  const existing: JarImport = {
    kids: [
      { id: 3, name: 'Ava', photo_uri: 'file:///ava.jpg', created_at: 1_700_000_000_000 },
      { id: 7, name: 'Ben', photo_uri: null, created_at: 1_700_000_000_001 },
    ],
    tasks: [
      {
        id: 11,
        name: 'Brush teeth',
        period: 'morning',
        coin_amount: 1,
        icon_emoji: '🪥',
        icon_photo_uri: null,
        created_at: 1_700_000_000_000,
      },
    ],
    completions: [{ kid_id: 3, task_id: 11, day_key: DAY, coin_amount: 1, created_at: 1_700_000_000_000 }],
    kid_savings: [
      { kid_id: 3, amount: 41 },
      { kid_id: 7, amount: -2 },
    ],
    wishes: [
      {
        id: 5,
        kid_id: 3,
        name: 'Bike',
        coin_amount: 100,
        icon_emoji: null,
        icon_photo_uri: 'data:image/jpeg;base64,AAAA',
        created_at: 1_700_000_000_000,
        claimed_at: null,
      },
      {
        id: 6,
        kid_id: 7,
        name: 'Ball',
        coin_amount: 4,
        icon_emoji: '⚽',
        icon_photo_uri: null,
        created_at: 1_700_000_000_000,
        claimed_at: 1_700_000_000_500,
      },
    ],
    consequence_types: [
      { id: 20, name: 'Say sorry', coin_amount: 0, icon_emoji: '🙏', icon_photo_uri: null, created_at: 1 },
    ],
    consequences: [
      { id: 30, kid_id: 7, consequence_type_id: 20, name: 'Say sorry', coin_amount: 0, day_key: DAY, created_at: 2 },
      { id: 31, kid_id: 7, consequence_type_id: null, name: 'Gone type', coin_amount: 2, day_key: DAY, created_at: 3 },
    ],
    app_settings: [
      { key: 'active_kid_id', value: '7' },
      { key: 'parent_pin', value: '314' },
      { key: 'sound_enabled', value: '0' },
    ],
  };

  it('keeps every row and id, and adds no starter types', async () => {
    const { token } = await newFamily({ label: 'Phone', jar: existing });
    const call = jar(token);
    expect(await call('listKids')).toEqual([
      { id: 3, name: 'Ava', photoUri: 'file:///ava.jpg', createdAt: 1_700_000_000_000 },
      { id: 7, name: 'Ben', photoUri: null, createdAt: 1_700_000_000_001 },
    ]);
    expect(await call('listCompletedTaskIds', 3, DAY)).toEqual([11]);
    expect(await call('getKidSavings', 3)).toBe(41);
    expect(await call('getKidSavings', 7)).toBe(-2);
    expect((await call('getWish', 5))?.icon.photoUri).toBe('data:image/jpeg;base64,AAAA');
    expect((await call('getWish', 6))?.claimedAt).toBe(1_700_000_000_500);
    expect((await call('listConsequenceTypes')).map((type) => type.id)).toEqual([20]);
    expect((await call('listConsequences', 7, DAY)).map((entry) => [entry.id, entry.icon.emoji])).toEqual([
      [30, '🙏'],
      [31, null],
    ]);
    expect(await call('getActiveKidId')).toBe(7);
    expect(await call('getParentPin')).toBe('314');
    expect(await call('getSoundEnabled')).toBe(false);

    // New rows carry on after the imported ids.
    expect(await call('insertKid', { name: 'Cleo', photoUri: null })).toBe(8);
  });

  it('keeps an empty list of consequence types empty', async () => {
    const { token } = await newFamily({ jar: { consequence_types: [] } });
    expect(await jar(token)('listConsequenceTypes')).toEqual([]);
  });

  it("turns away a jar that doesn't hold together, leaving nothing behind", async () => {
    const broken: unknown[] = [
      { wishes: existing.wishes },
      { kids: [{ id: 1, name: 'Ava', photo_uri: null }] },
      { kids: [{ id: 1, name: 'Ava', photo_uri: null, created_at: 1, age: 7 }] },
      { kids: [...existing.kids!, existing.kids![0]] },
      { pets: [] },
      { kids: {} },
      { app_settings: [{ key: 'secret', value: 'x' }] },
      { app_settings: [{ key: 'parent_pin', value: '1234' }] },
      { tasks: [{ ...existing.tasks![0], period: 'night' }] },
      [],
    ];
    for (const jarBody of broken) {
      const response = await createFamily({ jar: jarBody });
      expect(response.status, JSON.stringify(jarBody).slice(0, 80)).toBe(400);
    }
  });

  it('turns away a jar that is too big', async () => {
    const response = await relay('/families', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(21 * 1024 * 1024) },
      body: '{}',
    });
    expect(response.status).toBe(413);
  });
});

describe('size cap', () => {
  it('takes no more writes once the jar is full, but still reads and deletes', async () => {
    const { call, token, familyId } = await newJar();
    const kidId = await call('insertKid', { name: 'Ava', photoUri: null });
    // Fill the jar past the cap with rows the API never reads.
    await runInDurableObject(stub(familyId), (_, state) => {
      state.storage.sql.exec('CREATE TABLE ballast (data BLOB)');
      const rows = Math.ceil(MAX_JAR_BYTES / (1024 * 1024)) + 1;
      for (let row = 0; row < rows; row++) {
        state.storage.sql.exec('INSERT INTO ballast (data) VALUES (randomblob(1024 * 1024))');
      }
    });
    const full = await post(token, { fn: 'insertKid', args: [{ name: 'Ben', photoUri: null }] });
    expect(full.status).toBe(507);
    expect(await call('listKids')).toHaveLength(1);
    expect(await call('deleteKid', kidId)).toEqual([]);

    await runInDurableObject(stub(familyId), (_, state) => {
      state.storage.sql.exec('DROP TABLE ballast');
    });
  });
});

describe('CORS', () => {
  it("lets Wish Jar's pages in, with the token and JSON", async () => {
    const preflight = await relay('/jar/call', {
      method: 'OPTIONS',
      headers: {
        Origin: APP,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type');
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST');

    const created = await createFamily({}, { Origin: APP });
    expect(created.status).toBe(201);
    expect(created.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    const { token } = (await created.json()) as CreateFamilyReply;
    const called = await post(token, { fn: 'listKids', args: [] }, { Origin: 'http://localhost:8081' });
    expect(called.status).toBe(200);
    expect(called.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    expect(called.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps other sites out, and lets native apps (no Origin) in', async () => {
    const evil = await createFamily({}, { Origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const { token } = await newFamily();
    const call = await post(token, { fn: 'listKids', args: [] }, { Origin: 'https://evil.example' });
    expect(call.status).toBe(403);

    const native = await post(token, { fn: 'listKids', args: [] });
    expect(native.status).toBe(200);
    expect(native.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
