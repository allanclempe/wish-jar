import type { Period, Task } from '../db';

export const PERIOD_LABELS: Record<Period, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export const PERIOD_EMOJIS: Record<Period, string> = {
  morning: '🌅',
  afternoon: '☀️',
  evening: '🌙',
};

// Morning runs from midnight to 12:00, afternoon from 12:00 to 18:00, and
// evening from 18:00 to midnight, all on the device clock.
export function currentPeriod(now: Date = new Date()): Period {
  const hour = now.getHours();
  if (hour >= 18) return 'evening';
  if (hour >= 12) return 'afternoon';
  return 'morning';
}

export function tasksForPeriod(tasks: Task[], period: Period): Task[] {
  return tasks.filter((task) => task.period === period);
}

// Whether two loads of the tasks are the same, so the list can keep the task
// objects it has: the cards are memoized on them, and the tasks are read
// again every time the tab is shown.
export function sameTasks(a: Task[], b: Task[]): boolean {
  return (
    a.length === b.length &&
    a.every((task, i) => {
      const other = b[i];
      return (
        task.id === other.id &&
        task.name === other.name &&
        task.period === other.period &&
        task.coinAmount === other.coinAmount &&
        task.icon.emoji === other.icon.emoji &&
        task.icon.photoUri === other.icon.photoUri &&
        task.createdAt === other.createdAt
      );
    })
  );
}
