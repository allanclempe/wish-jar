import type { SQLiteDatabase } from 'expo-sqlite';

import type { Icon, Period, Task } from './types';

type TaskRow = {
  id: number;
  name: string;
  period: Period;
  coin_amount: number;
  icon_emoji: string | null;
  icon_photo_uri: string | null;
  created_at: number;
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    period: row.period,
    coinAmount: row.coin_amount,
    icon: { emoji: row.icon_emoji, photoUri: row.icon_photo_uri },
    createdAt: row.created_at,
  };
}

export async function listTasks(db: SQLiteDatabase): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT id, name, period, coin_amount, icon_emoji, icon_photo_uri, created_at FROM tasks ORDER BY created_at, id',
  );
  return rows.map(toTask);
}

export async function getTask(db: SQLiteDatabase, taskId: number): Promise<Task | null> {
  const row = await db.getFirstAsync<TaskRow>(
    'SELECT id, name, period, coin_amount, icon_emoji, icon_photo_uri, created_at FROM tasks WHERE id = ?',
    taskId,
  );
  return row ? toTask(row) : null;
}

export async function insertTask(
  db: SQLiteDatabase,
  input: { name: string; period: Period; coinAmount: number; icon: Icon },
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO tasks (name, period, coin_amount, icon_emoji, icon_photo_uri) VALUES (?, ?, ?, ?, ?)',
    input.name.trim(),
    input.period,
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
  );
  return result.lastInsertRowId;
}

export async function updateTask(
  db: SQLiteDatabase,
  taskId: number,
  input: { name: string; period: Period; coinAmount: number; icon: Icon },
): Promise<string | null> {
  const previous = await db.getFirstAsync<{ icon_photo_uri: string | null }>(
    'SELECT icon_photo_uri FROM tasks WHERE id = ?',
    taskId,
  );
  await db.runAsync(
    'UPDATE tasks SET name = ?, period = ?, coin_amount = ?, icon_emoji = ?, icon_photo_uri = ? WHERE id = ?',
    input.name.trim(),
    input.period,
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
    taskId,
  );
  return previous?.icon_photo_uri ?? null;
}

// Its ticks go with it, but the coins they earned stay in the kids' savings.
// Returns the task's photo, so the caller can remove it.
export async function deleteTask(db: SQLiteDatabase, taskId: number): Promise<string | null> {
  const row = await db.getFirstAsync<{ icon_photo_uri: string | null }>(
    'SELECT icon_photo_uri FROM tasks WHERE id = ?',
    taskId,
  );
  await db.runAsync('DELETE FROM tasks WHERE id = ?', taskId);
  return row?.icon_photo_uri ?? null;
}
