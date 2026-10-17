import type { ConsequenceTypeInput, JarApi, JarFn, KidInput, TaskInput, WishInput } from './api';
import {
  addConsequence,
  listConsequences,
  removeConsequence,
} from './consequences';
import {
  deleteConsequenceType,
  getConsequenceType,
  insertConsequenceType,
  listConsequenceTypes,
  updateConsequenceType,
} from './consequenceTypes';
import {
  getKidSavings,
  giveBonusCoins,
  listCompletedTaskIds,
  setTaskCompletion,
  sumCoinsEarnedOn,
} from './completions';
import { deleteKid, getKid, insertKid, listKids, setKidPhoto, updateKid } from './kids';
import { MAX_BONUS_COINS } from './limits';
import {
  getActiveKidId,
  getParentPin,
  getSoundEnabled,
  setActiveKidId,
  setParentPin,
  setSoundEnabled,
} from './settings';
import { replacePhoto } from './photos';
import type { Db } from './sql';
import { deleteTask, getTask, insertTask, listTasks, updateTask } from './tasks';
import {
  bad,
  boolean,
  coins,
  dayKey,
  icon,
  id,
  integer,
  name,
  period,
  photoUri,
  pin,
  record,
} from './validate';
import { deleteWish, getWish, insertWish, listWishes, updateWish, claimWish } from './wishes';

// read: never refused. write: refused once the jar is full. remove: frees
// space, so a full jar can always be tidied.
export type CallKind = 'read' | 'write' | 'remove';

type Call<F extends JarFn> = {
  kind: CallKind;
  arity: number;
  // Checks the untrusted arguments, then runs the query.
  run: (db: Db, args: unknown[]) => JarApi[F]['result'];
  // The photos the call may have left with nothing showing them (WJ-49): the
  // jar deletes those that nothing else shows.
  leftBehind?: (args: unknown[], result: JarApi[F]['result']) => (string | null)[];
};

// For the calls that return the photo they replaced or left behind.
const returned = (_args: unknown[], result: string | null | string[]) => [result].flat();

function givenPhoto(value: unknown, what: string): string {
  return photoUri(value, what) ?? bad(`${what} should be a photo`);
}

const kidInput = (value: unknown): KidInput => {
  const input = record(value, 'kid');
  return { name: name(input.name), photoUri: photoUri(input.photoUri) };
};

const taskInput = (value: unknown): TaskInput => {
  const input = record(value, 'task');
  return {
    name: name(input.name),
    period: period(input.period),
    coinAmount: coins(input.coinAmount),
    icon: icon(input.icon),
  };
};

const consequenceTypeInput = (value: unknown): ConsequenceTypeInput => {
  const input = record(value, 'consequence type');
  return { name: name(input.name), coinAmount: coins(input.coinAmount), icon: icon(input.icon) };
};

const wishInput = (value: unknown): WishInput => {
  const input = record(value, 'wish');
  return {
    kidId: id(input.kidId, 'kidId'),
    name: name(input.name),
    coinAmount: coins(input.coinAmount),
    icon: icon(input.icon),
  };
};

// Every function the jar answers to; anything else is refused.
export const CALLS: { [F in JarFn]: Call<F> } = {
  listKids: { kind: 'read', arity: 0, run: (db) => listKids(db) },
  getKid: { kind: 'read', arity: 1, run: (db, [kidId]) => getKid(db, id(kidId, 'kidId')) },
  insertKid: { kind: 'write', arity: 1, run: (db, [input]) => insertKid(db, kidInput(input)) },
  updateKid: {
    kind: 'write',
    leftBehind: returned,
    arity: 2,
    run: (db, [kidId, input]) => updateKid(db, id(kidId, 'kidId'), kidInput(input)),
  },
  setKidPhoto: {
    kind: 'write',
    leftBehind: returned,
    arity: 2,
    run: (db, [kidId, photo]) => setKidPhoto(db, id(kidId, 'kidId'), photoUri(photo)),
  },
  deleteKid: {
    kind: 'remove',
    leftBehind: returned,
    arity: 1,
    run: (db, [kidId]) => deleteKid(db, id(kidId, 'kidId')),
  },

  listTasks: { kind: 'read', arity: 0, run: (db) => listTasks(db) },
  getTask: { kind: 'read', arity: 1, run: (db, [taskId]) => getTask(db, id(taskId, 'taskId')) },
  insertTask: { kind: 'write', arity: 1, run: (db, [input]) => insertTask(db, taskInput(input)) },
  updateTask: {
    kind: 'write',
    leftBehind: returned,
    arity: 2,
    run: (db, [taskId, input]) => updateTask(db, id(taskId, 'taskId'), taskInput(input)),
  },
  deleteTask: {
    kind: 'remove',
    leftBehind: returned,
    arity: 1,
    run: (db, [taskId]) => deleteTask(db, id(taskId, 'taskId')),
  },

  listCompletedTaskIds: {
    kind: 'read',
    arity: 2,
    run: (db, [kidId, day]) => listCompletedTaskIds(db, id(kidId, 'kidId'), dayKey(day)),
  },
  sumCoinsEarnedOn: {
    kind: 'read',
    arity: 2,
    run: (db, [kidId, day]) => sumCoinsEarnedOn(db, id(kidId, 'kidId'), dayKey(day)),
  },
  getKidSavings: { kind: 'read', arity: 1, run: (db, [kidId]) => getKidSavings(db, id(kidId, 'kidId')) },
  setTaskCompletion: {
    kind: 'write',
    arity: 1,
    run: (db, [value]) => {
      const input = record(value, 'completion');
      return setTaskCompletion(db, {
        kidId: id(input.kidId, 'kidId'),
        taskId: id(input.taskId, 'taskId'),
        dayKey: dayKey(input.dayKey),
        coinAmount: coins(input.coinAmount),
        completed: boolean(input.completed, 'completed'),
      });
    },
  },
  giveBonusCoins: {
    kind: 'write',
    arity: 1,
    run: (db, [value]) => {
      const input = record(value, 'bonus');
      return giveBonusCoins(db, {
        kidId: id(input.kidId, 'kidId'),
        coins: integer(input.coins, 'coins', 1, MAX_BONUS_COINS),
      });
    },
  },

  listConsequenceTypes: { kind: 'read', arity: 0, run: (db) => listConsequenceTypes(db) },
  getConsequenceType: {
    kind: 'read',
    arity: 1,
    run: (db, [typeId]) => getConsequenceType(db, id(typeId, 'consequenceTypeId')),
  },
  insertConsequenceType: {
    kind: 'write',
    arity: 1,
    run: (db, [input]) => insertConsequenceType(db, consequenceTypeInput(input)),
  },
  updateConsequenceType: {
    kind: 'write',
    leftBehind: returned,
    arity: 2,
    run: (db, [typeId, input]) =>
      updateConsequenceType(db, id(typeId, 'consequenceTypeId'), consequenceTypeInput(input)),
  },
  deleteConsequenceType: {
    kind: 'remove',
    leftBehind: returned,
    arity: 1,
    run: (db, [typeId]) => deleteConsequenceType(db, id(typeId, 'consequenceTypeId')),
  },

  listConsequences: {
    kind: 'read',
    arity: 2,
    run: (db, [kidId, day]) => listConsequences(db, id(kidId, 'kidId'), dayKey(day)),
  },
  addConsequence: {
    kind: 'write',
    arity: 1,
    run: (db, [value]) => {
      const input = record(value, 'consequence');
      const type = record(input.consequenceType, 'consequenceType');
      return addConsequence(db, {
        kidId: id(input.kidId, 'kidId'),
        consequenceType: { id: id(type.id, 'consequenceType.id') },
        dayKey: dayKey(input.dayKey),
      });
    },
  },
  removeConsequence: {
    kind: 'remove',
    arity: 1,
    run: (db, [value]) => {
      const input = record(value, 'consequence');
      return removeConsequence(db, {
        consequenceId: id(input.consequenceId, 'consequenceId'),
        kidId: id(input.kidId, 'kidId'),
        dayKey: dayKey(input.dayKey),
      });
    },
  },

  listWishes: { kind: 'read', arity: 0, run: (db) => listWishes(db) },
  getWish: { kind: 'read', arity: 1, run: (db, [wishId]) => getWish(db, id(wishId, 'wishId')) },
  insertWish: { kind: 'write', arity: 1, run: (db, [input]) => insertWish(db, wishInput(input)) },
  updateWish: {
    kind: 'write',
    leftBehind: returned,
    arity: 2,
    run: (db, [wishId, input]) => updateWish(db, id(wishId, 'wishId'), wishInput(input)),
  },
  deleteWish: {
    kind: 'remove',
    leftBehind: returned,
    arity: 1,
    run: (db, [wishId]) => deleteWish(db, id(wishId, 'wishId')),
  },
  claimWish: {
    kind: 'write',
    arity: 1,
    run: (db, [value]) => {
      const input = record(value, 'claim');
      return claimWish(db, { wishId: id(input.wishId, 'wishId'), kidId: id(input.kidId, 'kidId') });
    },
  },

  getActiveKidId: { kind: 'read', arity: 0, run: (db) => getActiveKidId(db) },
  setActiveKidId: {
    kind: 'write',
    arity: 1,
    run: (db, [kidId]) => setActiveKidId(db, id(kidId, 'kidId')),
  },
  getParentPin: { kind: 'read', arity: 0, run: (db) => getParentPin(db) },
  setParentPin: { kind: 'write', arity: 1, run: (db, [value]) => setParentPin(db, pin(value)) },
  getSoundEnabled: { kind: 'read', arity: 0, run: (db) => getSoundEnabled(db) },
  setSoundEnabled: {
    kind: 'write',
    arity: 1,
    run: (db, [enabled]) => setSoundEnabled(db, boolean(enabled, 'enabled')),
  },

  replacePhoto: {
    kind: 'write',
    arity: 2,
    run: (db, [from, to]) => replacePhoto(db, givenPhoto(from, 'from'), givenPhoto(to, 'to')),
    leftBehind: ([from]) => [typeof from === 'string' ? from : null],
  },
};

// The allowlisted call for `fn`, or a 400. Own properties only, so
// "constructor" and friends aren't functions.
export function findCall(fn: unknown, args: unknown): { call: Call<JarFn>; args: unknown[] } {
  if (typeof fn !== 'string' || !Object.hasOwn(CALLS, fn)) bad('No such function');
  const call = CALLS[fn as JarFn] as Call<JarFn>;
  if (!Array.isArray(args) || args.length !== call.arity) {
    bad(`${fn} takes ${call.arity} argument${call.arity === 1 ? '' : 's'}`);
  }
  return { call, args };
}
