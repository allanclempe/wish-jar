import type { TaskCompletionChange, TaskCompletionInput } from '@wish-jar/jar';
import { all, type Db, first, run } from './sql';

type CompletionResult = Omit<TaskCompletionChange, 'savings'>;

const UNCHANGED: CompletionResult = { changed: false, coins: 0 };

export function listCompletedTaskIds(db: Db, kidId: number, dayKey: string): number[] {
  return all<{ task_id: number }>(
    db,
    'SELECT task_id FROM completions WHERE kid_id = ? AND day_key = ?',
    kidId,
    dayKey,
  ).map((row) => row.task_id);
}

// Every coin the kid earned on one day, over all periods: what the
// period-complete celebration shows as "+17 today". Consequences are not
// taken off; they live in their own table.
export function sumCoinsEarnedOn(db: Db, kidId: number, dayKey: string): number {
  const row = first<{ total: number | null }>(
    db,
    'SELECT SUM(coin_amount) AS total FROM completions WHERE kid_id = ? AND day_key = ?',
    kidId,
    dayKey,
  );
  return row?.total ?? 0;
}

export function getKidSavings(db: Db, kidId: number): number {
  const row = first<{ amount: number }>(db, 'SELECT amount FROM kid_savings WHERE kid_id = ?', kidId);
  return row?.amount ?? 0;
}

export function addToSavings(db: Db, kidId: number, delta: number): void {
  run(
    db,
    'INSERT INTO kid_savings (kid_id, amount) VALUES (?, ?) ON CONFLICT (kid_id) DO UPDATE SET amount = amount + excluded.amount',
    kidId,
    delta,
  );
}

// The tick adds the task's coins as the jar has them, not as the device last
// saw them: a grown-up may have changed them on another device.
function addCompletion(db: Db, input: TaskCompletionInput): CompletionResult {
  const task = first<{ coin_amount: number }>(db, 'SELECT coin_amount FROM tasks WHERE id = ?', input.taskId);
  if (!task) return UNCHANGED;
  const added = all<{ coin_amount: number }>(
    db,
    'INSERT INTO completions (kid_id, task_id, day_key, coin_amount) VALUES (?, ?, ?, ?) ON CONFLICT (kid_id, task_id, day_key) DO NOTHING RETURNING coin_amount',
    input.kidId,
    input.taskId,
    input.dayKey,
    task.coin_amount,
  );
  if (added.length === 0) return UNCHANGED;
  addToSavings(db, input.kidId, task.coin_amount);
  return { changed: true, coins: task.coin_amount };
}

// Takes back exactly what the tick added.
function removeCompletion(db: Db, input: TaskCompletionInput): CompletionResult {
  const removed = first<{ coin_amount: number }>(
    db,
    'DELETE FROM completions WHERE kid_id = ? AND task_id = ? AND day_key = ? RETURNING coin_amount',
    input.kidId,
    input.taskId,
    input.dayKey,
  );
  if (!removed) return UNCHANGED;
  addToSavings(db, input.kidId, -removed.coin_amount);
  return { changed: true, coins: removed.coin_amount };
}

// Saves the tick and its savings change together, so one can't be kept
// without the other.
export function setTaskCompletion(db: Db, input: TaskCompletionInput): TaskCompletionChange {
  return db.transactionSync(() => {
    const result = input.completed ? addCompletion(db, input) : removeCompletion(db, input);
    return { ...result, savings: getKidSavings(db, input.kidId) };
  });
}

// Coins a grown-up gives for something special outside the tasks. Only the
// savings change is kept: a bonus has no record of its own.
export function giveBonusCoins(db: Db, input: { kidId: number; coins: number }): null {
  addToSavings(db, input.kidId, input.coins);
  return null;
}
