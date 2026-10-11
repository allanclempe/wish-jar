import type { SQLiteDatabase } from 'expo-sqlite';

import type { Icon, Task } from './types';

type TaskRow = {
  id: number;
  name: string;
  coin_amount: number;
  icon_emoji: string | null;
  icon_photo_uri: string | null;
  created_at: number;
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    coinAmount: row.coin_amount,
    icon: { emoji: row.icon_emoji, photoUri: row.icon_photo_uri },
    createdAt: row.created_at,
  };
}

export async function listTasks(db: SQLiteDatabase): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT id, name, coin_amount, icon_emoji, icon_photo_uri, created_at FROM tasks ORDER BY created_at, id',
  );
  return rows.map(toTask);
}

export async function getTask(db: SQLiteDatabase, taskId: number): Promise<Task | null> {
  const row = await db.getFirstAsync<TaskRow>(
    'SELECT id, name, coin_amount, icon_emoji, icon_photo_uri, created_at FROM tasks WHERE id = ?',
    taskId,
  );
  return row ? toTask(row) : null;
}

export async function insertTask(
  db: SQLiteDatabase,
  input: { name: string; coinAmount: number; icon: Icon },
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO tasks (name, coin_amount, icon_emoji, icon_photo_uri) VALUES (?, ?, ?, ?)',
    input.name.trim(),
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
  );
  return result.lastInsertRowId;
}

export async function updateTask(
  db: SQLiteDatabase,
  taskId: number,
  input: { name: string; coinAmount: number; icon: Icon },
): Promise<string | null> {
  const previous = await db.getFirstAsync<{ icon_photo_uri: string | null }>(
    'SELECT icon_photo_uri FROM tasks WHERE id = ?',
    taskId,
  );
  await db.runAsync(
    'UPDATE tasks SET name = ?, coin_amount = ?, icon_emoji = ?, icon_photo_uri = ? WHERE id = ?',
    input.name.trim(),
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
    taskId,
  );
  return previous?.icon_photo_uri ?? null;
}

export async function deleteTask(db: SQLiteDatabase, taskId: number): Promise<void> {
  await db.runAsync('DELETE FROM tasks WHERE id = ?', taskId);
}
