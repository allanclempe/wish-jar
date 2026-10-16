import type { SQLiteDatabase } from 'expo-sqlite';

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

type CompletionResult = Omit<TaskCompletionChange, 'savings'>;

const UNCHANGED: CompletionResult = { changed: false, coins: 0 };

// Transactions on one connection are not exclusive, so overlapping taps would
// try to open a second transaction inside the first. Writes run one at a time.
let writeQueue: Promise<unknown> = Promise.resolve();

export function queueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => {});
  return run;
}

export async function listCompletedTaskIds(
  db: SQLiteDatabase,
  kidId: number,
  dayKey: string,
): Promise<number[]> {
  const rows = await db.getAllAsync<{ task_id: number }>(
    'SELECT task_id FROM completions WHERE kid_id = ? AND day_key = ?',
    kidId,
    dayKey,
  );
  return rows.map((row) => row.task_id);
}

// Every coin the kid earned on one day, over all periods: what the
// period-complete celebration shows as "+17 today". Consequences are not
// taken off; they live in their own table.
export async function sumCoinsEarnedOn(db: SQLiteDatabase, kidId: number, dayKey: string): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(coin_amount) AS total FROM completions WHERE kid_id = ? AND day_key = ?',
    kidId,
    dayKey,
  );
  return row?.total ?? 0;
}

export async function getKidSavings(db: SQLiteDatabase, kidId: number): Promise<number> {
  const row = await db.getFirstAsync<{ amount: number }>(
    'SELECT amount FROM kid_savings WHERE kid_id = ?',
    kidId,
  );
  return row?.amount ?? 0;
}

export async function addToSavings(db: SQLiteDatabase, kidId: number, delta: number): Promise<void> {
  await db.runAsync(
    'INSERT INTO kid_savings (kid_id, amount) VALUES (?, ?) ON CONFLICT (kid_id) DO UPDATE SET amount = amount + excluded.amount',
    kidId,
    delta,
  );
}

async function addCompletion(
  db: SQLiteDatabase,
  input: TaskCompletionInput,
): Promise<CompletionResult> {
  const result = await db.runAsync(
    'INSERT INTO completions (kid_id, task_id, day_key, coin_amount) VALUES (?, ?, ?, ?) ON CONFLICT (kid_id, task_id, day_key) DO NOTHING',
    input.kidId,
    input.taskId,
    input.dayKey,
    input.coinAmount,
  );
  if (result.changes === 0) return UNCHANGED;
  await addToSavings(db, input.kidId, input.coinAmount);
  return { changed: true, coins: input.coinAmount };
}

async function removeCompletion(
  db: SQLiteDatabase,
  input: TaskCompletionInput,
): Promise<CompletionResult> {
  const row = await db.getFirstAsync<{ coin_amount: number }>(
    'SELECT coin_amount FROM completions WHERE kid_id = ? AND task_id = ? AND day_key = ?',
    input.kidId,
    input.taskId,
    input.dayKey,
  );
  if (!row) return UNCHANGED;
  await db.runAsync(
    'DELETE FROM completions WHERE kid_id = ? AND task_id = ? AND day_key = ?',
    input.kidId,
    input.taskId,
    input.dayKey,
  );
  await addToSavings(db, input.kidId, -row.coin_amount);
  return { changed: true, coins: row.coin_amount };
}

// Saves the tick and its savings change together, so a crash can't leave one
// without the other.
export function setTaskCompletion(
  db: SQLiteDatabase,
  input: TaskCompletionInput,
): Promise<TaskCompletionChange> {
  return queueWrite(async () => {
    let change: TaskCompletionChange = { ...UNCHANGED, savings: 0 };
    await db.withTransactionAsync(async () => {
      const result = input.completed
        ? await addCompletion(db, input)
        : await removeCompletion(db, input);
      change = { ...result, savings: await getKidSavings(db, input.kidId) };
    });
    return change;
  });
}
