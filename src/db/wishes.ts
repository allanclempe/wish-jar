import type { SQLiteDatabase } from 'expo-sqlite';

import type { Icon, Wish } from './types';

type WishRow = {
  id: number;
  kid_id: number;
  name: string;
  coin_amount: number;
  icon_emoji: string | null;
  icon_photo_uri: string | null;
  created_at: number;
};

function toWish(row: WishRow): Wish {
  return {
    id: row.id,
    kidId: row.kid_id,
    name: row.name,
    coinAmount: row.coin_amount,
    icon: { emoji: row.icon_emoji, photoUri: row.icon_photo_uri },
    createdAt: row.created_at,
  };
}

export async function listWishes(db: SQLiteDatabase): Promise<Wish[]> {
  const rows = await db.getAllAsync<WishRow>(
    'SELECT id, kid_id, name, coin_amount, icon_emoji, icon_photo_uri, created_at FROM wishes ORDER BY created_at, id',
  );
  return rows.map(toWish);
}

export async function insertWish(
  db: SQLiteDatabase,
  input: { kidId: number; name: string; coinAmount: number; icon: Icon },
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO wishes (kid_id, name, coin_amount, icon_emoji, icon_photo_uri) VALUES (?, ?, ?, ?, ?)',
    input.kidId,
    input.name.trim(),
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
  );
  return result.lastInsertRowId;
}
