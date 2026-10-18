import type { Wish, WishClaim, WishInput } from '@wish-jar/jar';
import { addToSavings, getKidSavings } from './completions';
import { all, type Db, first, insert, run } from './sql';

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

const SELECT_WISH =
  'SELECT id, kid_id, name, coin_amount, icon_emoji, icon_photo_uri, created_at, claimed_at FROM wishes';

export function listWishes(db: Db): Wish[] {
  return all<WishRow>(db, `${SELECT_WISH} ORDER BY created_at, id`).map(toWish);
}

export function getWish(db: Db, wishId: number): Wish | null {
  const row = first<WishRow>(db, `${SELECT_WISH} WHERE id = ?`, wishId);
  return row ? toWish(row) : null;
}

export function insertWish(db: Db, input: WishInput): number {
  return insert(
    db,
    'INSERT INTO wishes (kid_id, name, coin_amount, icon_emoji, icon_photo_uri) VALUES (?, ?, ?, ?, ?)',
    input.kidId,
    input.name,
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
  );
}

// Returns the wish's previous photo, so the caller can remove it once replaced.
export function updateWish(db: Db, wishId: number, input: WishInput): string | null {
  const previous = first<{ icon_photo_uri: string | null }>(
    db,
    'SELECT icon_photo_uri FROM wishes WHERE id = ?',
    wishId,
  );
  run(
    db,
    'UPDATE wishes SET kid_id = ?, name = ?, coin_amount = ?, icon_emoji = ?, icon_photo_uri = ? WHERE id = ?',
    input.kidId,
    input.name,
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
    wishId,
  );
  return previous?.icon_photo_uri ?? null;
}

// A claimed wish's coins stay spent. Returns the wish's photo, so the caller
// can remove it.
export function deleteWish(db: Db, wishId: number): string | null {
  const row = first<{ icon_photo_uri: string | null }>(
    db,
    'DELETE FROM wishes WHERE id = ? RETURNING icon_photo_uri',
    wishId,
  );
  return row?.icon_photo_uri ?? null;
}

// Marks the wish handed over and takes its coins in one go, checking the
// balance inside the transaction so a claim can't overdraw the kid.
export function claimWish(db: Db, input: { wishId: number; kidId: number }): WishClaim {
  const { wishId, kidId } = input;
  return db.transactionSync(() => {
    const row = first<{ coin_amount: number }>(
      db,
      'SELECT coin_amount FROM wishes WHERE id = ? AND kid_id = ? AND claimed_at IS NULL',
      wishId,
      kidId,
    );
    if (!row || getKidSavings(db, kidId) < row.coin_amount) return { changed: false, coins: 0 };
    run(db, 'UPDATE wishes SET claimed_at = ? WHERE id = ? AND kid_id = ?', Date.now(), wishId, kidId);
    addToSavings(db, kidId, -row.coin_amount);
    return { changed: true, coins: row.coin_amount };
  });
}
