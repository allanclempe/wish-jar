import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION = 4;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS kids (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      photo_uri TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY NOT NULL,
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY NOT NULL,
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS tasks_kid_id_idx ON tasks (kid_id);
    CREATE INDEX IF NOT EXISTS wishes_kid_id_idx ON wishes (kid_id);
  `,
  2: `
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `,
  // The version 1 tasks table matched an early money-based model and was
  // never written to; replace it with the parent-defined coin task.
  3: `
    DROP INDEX IF EXISTS tasks_kid_id_idx;
    DROP TABLE IF EXISTS tasks;

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      coin_amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `,
  // The version 1 wishes table tracked money in cents and was never written
  // to; replace it with the parent-defined coin wish.
  4: `
    ALTER TABLE tasks ADD COLUMN icon_emoji TEXT;
    ALTER TABLE tasks ADD COLUMN icon_photo_uri TEXT;

    DROP INDEX IF EXISTS wishes_kid_id_idx;
    DROP TABLE IF EXISTS wishes;

    CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY NOT NULL,
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      coin_amount INTEGER NOT NULL CHECK (coin_amount >= 0),
      icon_emoji TEXT,
      icon_photo_uri TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS wishes_kid_id_idx ON wishes (kid_id);
  `,
};

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version >= DATABASE_VERSION) {
    return;
  }

  for (let next = version + 1; next <= DATABASE_VERSION; next += 1) {
    const migration = MIGRATIONS[next];
    if (migration) {
      await db.execAsync(migration);
    }
    version = next;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}
