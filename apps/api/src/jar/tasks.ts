import type { Task, TaskInput } from '@wish-jar/jar';
import { all, type Db, first, insert, run } from './sql';

type TaskRow = {
  id: number;
  name: string;
  period: Task['period'];
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

const SELECT_TASK = 'SELECT id, name, period, coin_amount, icon_emoji, icon_photo_uri, created_at FROM tasks';

export function listTasks(db: Db): Task[] {
  return all<TaskRow>(db, `${SELECT_TASK} ORDER BY created_at, id`).map(toTask);
}

export function getTask(db: Db, taskId: number): Task | null {
  const row = first<TaskRow>(db, `${SELECT_TASK} WHERE id = ?`, taskId);
  return row ? toTask(row) : null;
}

export function insertTask(db: Db, input: TaskInput): number {
  return insert(
    db,
    'INSERT INTO tasks (name, period, coin_amount, icon_emoji, icon_photo_uri) VALUES (?, ?, ?, ?, ?)',
    input.name,
    input.period,
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
  );
}

export function updateTask(db: Db, taskId: number, input: TaskInput): string | null {
  const previous = first<{ icon_photo_uri: string | null }>(
    db,
    'SELECT icon_photo_uri FROM tasks WHERE id = ?',
    taskId,
  );
  run(
    db,
    'UPDATE tasks SET name = ?, period = ?, coin_amount = ?, icon_emoji = ?, icon_photo_uri = ? WHERE id = ?',
    input.name,
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
export function deleteTask(db: Db, taskId: number): string | null {
  const row = first<{ icon_photo_uri: string | null }>(
    db,
    'DELETE FROM tasks WHERE id = ? RETURNING icon_photo_uri',
    taskId,
  );
  return row?.icon_photo_uri ?? null;
}
