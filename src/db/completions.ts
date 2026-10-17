import type { FamilyJar } from './jar';

export type TaskCompletionInput = {
  kidId: number;
  taskId: number;
  dayKey: string;
  coinAmount: number;
  completed: boolean;
};

// The coins this change moved into (or out of) the kid's savings. `changed` is
// false when the tick was already in the requested state, so nothing moved.
// `savings` is the kid's balance once the change was saved.
export type TaskCompletionChange = {
  changed: boolean;
  coins: number;
  savings: number;
};

export function listCompletedTaskIds(jar: FamilyJar, kidId: number, dayKey: string): Promise<number[]> {
  return jar.call('listCompletedTaskIds', kidId, dayKey);
}

// Every coin the kid earned on one day, over all periods: what the
// period-complete celebration shows as "+17 today". Consequences are not
// taken off.
export function sumCoinsEarnedOn(jar: FamilyJar, kidId: number, dayKey: string): Promise<number> {
  return jar.call('sumCoinsEarnedOn', kidId, dayKey);
}

export function getKidSavings(jar: FamilyJar, kidId: number): Promise<number> {
  return jar.call('getKidSavings', kidId);
}

// The jar saves the tick and its savings change together, and ticks off the
// task's coins as it has them: another device may have changed them since
// this one loaded the task.
export function setTaskCompletion(
  jar: FamilyJar,
  input: TaskCompletionInput,
): Promise<TaskCompletionChange> {
  return jar.call('setTaskCompletion', input);
}
