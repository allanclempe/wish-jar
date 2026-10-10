import type { SQLiteDatabase } from 'expo-sqlite';

import type { Task } from './types';

type TaskRow = {
  id: number;
  name: string;
  coin_amount: number;
  created_at: number;
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    coinAmount: row.coin_amount,
    createdAt: row.created_at,
  };
}

export async function listTasks(db: SQLiteDatabase): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT id, name, coin_amount, created_at FROM tasks ORDER BY created_at, id',
  );
  return rows.map(toTask);
}

export async function getTask(db: SQLiteDatabase, taskId: number): Promise<Task | null> {
  const row = await db.getFirstAsync<TaskRow>(
    'SELECT id, name, coin_amount, created_at FROM tasks WHERE id = ?',
    taskId,
  );
  return row ? toTask(row) : null;
}

export async function insertTask(
  db: SQLiteDatabase,
  input: { name: string; coinAmount: number },
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO tasks (name, coin_amount) VALUES (?, ?)',
    input.name.trim(),
    input.coinAmount,
  );
  return result.lastInsertRowId;
}

export async function updateTask(
  db: SQLiteDatabase,
  taskId: number,
  input: { name: string; coinAmount: number },
): Promise<void> {
  await db.runAsync(
    'UPDATE tasks SET name = ?, coin_amount = ? WHERE id = ?',
    input.name.trim(),
    input.coinAmount,
    taskId,
  );
}

export async function deleteTask(db: SQLiteDatabase, taskId: number): Promise<void> {
  await db.runAsync('DELETE FROM tasks WHERE id = ?', taskId);
}
