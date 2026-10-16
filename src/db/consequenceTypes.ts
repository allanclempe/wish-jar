import type { SQLiteDatabase } from 'expo-sqlite';

import type { Icon, ConsequenceType } from './types';

type ConsequenceTypeRow = {
  id: number;
  name: string;
  coin_amount: number;
  icon_emoji: string | null;
  icon_photo_uri: string | null;
  created_at: number;
};

function toConsequenceType(row: ConsequenceTypeRow): ConsequenceType {
  return {
    id: row.id,
    name: row.name,
    coinAmount: row.coin_amount,
    icon: { emoji: row.icon_emoji, photoUri: row.icon_photo_uri },
    createdAt: row.created_at,
  };
}

export async function listConsequenceTypes(db: SQLiteDatabase): Promise<ConsequenceType[]> {
  const rows = await db.getAllAsync<ConsequenceTypeRow>(
    'SELECT id, name, coin_amount, icon_emoji, icon_photo_uri, created_at FROM consequence_types ORDER BY created_at, id',
  );
  return rows.map(toConsequenceType);
}

export async function getConsequenceType(
  db: SQLiteDatabase,
  consequenceTypeId: number,
): Promise<ConsequenceType | null> {
  const row = await db.getFirstAsync<ConsequenceTypeRow>(
    'SELECT id, name, coin_amount, icon_emoji, icon_photo_uri, created_at FROM consequence_types WHERE id = ?',
    consequenceTypeId,
  );
  return row ? toConsequenceType(row) : null;
}

export async function insertConsequenceType(
  db: SQLiteDatabase,
  input: { name: string; coinAmount: number; icon: Icon },
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO consequence_types (name, coin_amount, icon_emoji, icon_photo_uri) VALUES (?, ?, ?, ?)',
    input.name.trim(),
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
  );
  return result.lastInsertRowId;
}

export async function updateConsequenceType(
  db: SQLiteDatabase,
  consequenceTypeId: number,
  input: { name: string; coinAmount: number; icon: Icon },
): Promise<string | null> {
  const previous = await db.getFirstAsync<{ icon_photo_uri: string | null }>(
    'SELECT icon_photo_uri FROM consequence_types WHERE id = ?',
    consequenceTypeId,
  );
  await db.runAsync(
    'UPDATE consequence_types SET name = ?, coin_amount = ?, icon_emoji = ?, icon_photo_uri = ? WHERE id = ?',
    input.name.trim(),
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
    consequenceTypeId,
  );
  return previous?.icon_photo_uri ?? null;
}

// Entries already logged keep their name and coins (ON DELETE SET NULL), and
// show the fallback icon from then on. Returns the type's photo, so the caller
// can remove it.
export async function deleteConsequenceType(
  db: SQLiteDatabase,
  consequenceTypeId: number,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ icon_photo_uri: string | null }>(
    'SELECT icon_photo_uri FROM consequence_types WHERE id = ?',
    consequenceTypeId,
  );
  await db.runAsync('DELETE FROM consequence_types WHERE id = ?', consequenceTypeId);
  return row?.icon_photo_uri ?? null;
}
