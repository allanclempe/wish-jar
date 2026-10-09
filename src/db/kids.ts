import type { SQLiteDatabase } from 'expo-sqlite';

import type { Kid } from './types';

type KidRow = {
  id: number;
  name: string;
  photo_uri: string | null;
  created_at: number;
};

function toKid(row: KidRow): Kid {
  return {
    id: row.id,
    name: row.name,
    photoUri: row.photo_uri,
    createdAt: row.created_at,
  };
}

export async function listKids(db: SQLiteDatabase): Promise<Kid[]> {
  const rows = await db.getAllAsync<KidRow>(
    'SELECT id, name, photo_uri, created_at FROM kids ORDER BY created_at, id',
  );
  return rows.map(toKid);
}

export async function insertKid(
  db: SQLiteDatabase,
  input: { name: string; photoUri: string | null },
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO kids (name, photo_uri) VALUES (?, ?)',
    input.name.trim(),
    input.photoUri,
  );
  return result.lastInsertRowId;
}

export async function setKidPhoto(
  db: SQLiteDatabase,
  kidId: number,
  photoUri: string | null,
): Promise<string | null> {
  const previous = await db.getFirstAsync<{ photo_uri: string | null }>(
    'SELECT photo_uri FROM kids WHERE id = ?',
    kidId,
  );
  await db.runAsync('UPDATE kids SET photo_uri = ? WHERE id = ?', photoUri, kidId);
  return previous?.photo_uri ?? null;
}

export async function deleteKid(db: SQLiteDatabase, kidId: number): Promise<string | null> {
  const row = await db.getFirstAsync<{ photo_uri: string | null }>(
    'SELECT photo_uri FROM kids WHERE id = ?',
    kidId,
  );
  await db.runAsync('DELETE FROM kids WHERE id = ?', kidId);
  return row?.photo_uri ?? null;
}
