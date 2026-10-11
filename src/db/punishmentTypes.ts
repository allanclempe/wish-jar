import type { SQLiteDatabase } from 'expo-sqlite';

import type { Icon, PunishmentType } from './types';

type PunishmentTypeRow = {
  id: number;
  name: string;
  coin_amount: number;
  icon_emoji: string | null;
  icon_photo_uri: string | null;
  created_at: number;
};

function toPunishmentType(row: PunishmentTypeRow): PunishmentType {
  return {
    id: row.id,
    name: row.name,
    coinAmount: row.coin_amount,
    icon: { emoji: row.icon_emoji, photoUri: row.icon_photo_uri },
    createdAt: row.created_at,
  };
}

export async function listPunishmentTypes(db: SQLiteDatabase): Promise<PunishmentType[]> {
  const rows = await db.getAllAsync<PunishmentTypeRow>(
    'SELECT id, name, coin_amount, icon_emoji, icon_photo_uri, created_at FROM punishment_types ORDER BY created_at, id',
  );
  return rows.map(toPunishmentType);
}

export async function getPunishmentType(
  db: SQLiteDatabase,
  punishmentTypeId: number,
): Promise<PunishmentType | null> {
  const row = await db.getFirstAsync<PunishmentTypeRow>(
    'SELECT id, name, coin_amount, icon_emoji, icon_photo_uri, created_at FROM punishment_types WHERE id = ?',
    punishmentTypeId,
  );
  return row ? toPunishmentType(row) : null;
}

export async function insertPunishmentType(
  db: SQLiteDatabase,
  input: { name: string; coinAmount: number; icon: Icon },
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO punishment_types (name, coin_amount, icon_emoji, icon_photo_uri) VALUES (?, ?, ?, ?)',
    input.name.trim(),
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
  );
  return result.lastInsertRowId;
}

export async function updatePunishmentType(
  db: SQLiteDatabase,
  punishmentTypeId: number,
  input: { name: string; coinAmount: number; icon: Icon },
): Promise<string | null> {
  const previous = await db.getFirstAsync<{ icon_photo_uri: string | null }>(
    'SELECT icon_photo_uri FROM punishment_types WHERE id = ?',
    punishmentTypeId,
  );
  await db.runAsync(
    'UPDATE punishment_types SET name = ?, coin_amount = ?, icon_emoji = ?, icon_photo_uri = ? WHERE id = ?',
    input.name.trim(),
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
    punishmentTypeId,
  );
  return previous?.icon_photo_uri ?? null;
}
