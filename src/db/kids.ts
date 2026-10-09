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
