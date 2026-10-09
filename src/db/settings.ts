import type { SQLiteDatabase } from 'expo-sqlite';

const ACTIVE_KID_KEY = 'active_kid_id';

export async function getActiveKidId(db: SQLiteDatabase): Promise<number | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    ACTIVE_KID_KEY,
  );
  return row ? Number(row.value) : null;
}

export async function setActiveKidId(db: SQLiteDatabase, kidId: number): Promise<void> {
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ACTIVE_KID_KEY,
    String(kidId),
  );
}
