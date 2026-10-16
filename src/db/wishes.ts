import type { SQLiteDatabase } from 'expo-sqlite';

import { addToSavings, getKidSavings, queueWrite } from './completions';
import type { Icon, Wish } from './types';

type WishRow = {
  id: number;
  kid_id: number;
  name: string;
  coin_amount: number;
  icon_emoji: string | null;
  icon_photo_uri: string | null;
  created_at: number;
  claimed_at: number | null;
};

function toWish(row: WishRow): Wish {
  return {
    id: row.id,
    kidId: row.kid_id,
    name: row.name,
    coinAmount: row.coin_amount,
    icon: { emoji: row.icon_emoji, photoUri: row.icon_photo_uri },
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
  };
}

export async function listWishes(db: SQLiteDatabase): Promise<Wish[]> {
  const rows = await db.getAllAsync<WishRow>(
    'SELECT id, kid_id, name, coin_amount, icon_emoji, icon_photo_uri, created_at, claimed_at FROM wishes ORDER BY created_at, id',
  );
  return rows.map(toWish);
}

export async function getWish(db: SQLiteDatabase, wishId: number): Promise<Wish | null> {
  const row = await db.getFirstAsync<WishRow>(
    'SELECT id, kid_id, name, coin_amount, icon_emoji, icon_photo_uri, created_at, claimed_at FROM wishes WHERE id = ?',
    wishId,
  );
  return row ? toWish(row) : null;
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

// Returns the wish's previous photo, so the caller can remove it once replaced.
export async function updateWish(
  db: SQLiteDatabase,
  wishId: number,
  input: { kidId: number; name: string; coinAmount: number; icon: Icon },
): Promise<string | null> {
  const previous = await db.getFirstAsync<{ icon_photo_uri: string | null }>(
    'SELECT icon_photo_uri FROM wishes WHERE id = ?',
    wishId,
  );
  await db.runAsync(
    'UPDATE wishes SET kid_id = ?, name = ?, coin_amount = ?, icon_emoji = ?, icon_photo_uri = ? WHERE id = ?',
    input.kidId,
    input.name.trim(),
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
    wishId,
  );
  return previous?.icon_photo_uri ?? null;
}

// A claimed wish's coins stay spent. Returns the wish's photo, so the caller
// can remove it.
export async function deleteWish(db: SQLiteDatabase, wishId: number): Promise<string | null> {
  const row = await db.getFirstAsync<{ icon_photo_uri: string | null }>(
    'SELECT icon_photo_uri FROM wishes WHERE id = ?',
    wishId,
  );
  await db.runAsync('DELETE FROM wishes WHERE id = ?', wishId);
  return row?.icon_photo_uri ?? null;
}

// The coins a claim took from the kid's savings. `changed` is false when the
// wish was already claimed or the kid no longer has enough coins for it.
export type WishClaim = {
  changed: boolean;
  coins: number;
};

// Marks the wish handed over and takes its coins in one go, checking the
// balance inside the transaction so a claim can't overdraw the kid.
export function claimWish(
  db: SQLiteDatabase,
  input: { wishId: number; kidId: number },
): Promise<WishClaim> {
  const { wishId, kidId } = input;
  return queueWrite(async () => {
    let claim: WishClaim = { changed: false, coins: 0 };
    await db.withTransactionAsync(async () => {
      const row = await db.getFirstAsync<{ coin_amount: number }>(
        'SELECT coin_amount FROM wishes WHERE id = ? AND kid_id = ? AND claimed_at IS NULL',
        wishId,
        kidId,
      );
      if (!row || (await getKidSavings(db, kidId)) < row.coin_amount) return;
      await db.runAsync(
        'UPDATE wishes SET claimed_at = ? WHERE id = ? AND kid_id = ?',
        Date.now(),
        wishId,
        kidId,
      );
      await addToSavings(db, kidId, -row.coin_amount);
      claim = { changed: true, coins: row.coin_amount };
    });
    return claim;
  });
}
