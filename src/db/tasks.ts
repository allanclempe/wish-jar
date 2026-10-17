import type { FamilyJar } from './jar';
import type { Icon, Period, Task } from './types';

export function listTasks(jar: FamilyJar): Promise<Task[]> {
  return jar.call('listTasks');
}

export function getTask(jar: FamilyJar, taskId: number): Promise<Task | null> {
  return jar.call('getTask', taskId);
}

export function insertTask(
  jar: FamilyJar,
  input: { name: string; period: Period; coinAmount: number; icon: Icon },
): Promise<number> {
  return jar.call('insertTask', input);
}

// Returns the task's previous photo, so the caller can remove it once replaced.
export function updateTask(
  jar: FamilyJar,
  taskId: number,
  input: { name: string; period: Period; coinAmount: number; icon: Icon },
): Promise<string | null> {
  return jar.call('updateTask', taskId, input);
}

// Its ticks go with it, but the coins they earned stay in the kids' savings.
// Returns the task's photo, so the caller can remove it.
export function deleteTask(jar: FamilyJar, taskId: number): Promise<string | null> {
  return jar.call('deleteTask', taskId);
}
