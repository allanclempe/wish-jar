import type { SQLiteDatabase } from 'expo-sqlite';

import { addToSavings, queueWrite } from './completions';
import type { Punishment, PunishmentType } from './types';

type PunishmentRow = {
  id: number;
  kid_id: number;
  punishment_type_id: number | null;
  name: string;
  coin_amount: number;
  icon_emoji: string | null;
  icon_photo_uri: string | null;
  day_key: string;
  created_at: number;
};

// The icon comes from the type, so an edited icon shows on earlier entries too.
const SELECT_PUNISHMENT = `
  SELECT p.id, p.kid_id, p.punishment_type_id, p.name, p.coin_amount,
    t.icon_emoji, t.icon_photo_uri, p.day_key, p.created_at
  FROM punishments p
  LEFT JOIN punishment_types t ON t.id = p.punishment_type_id
`;

function toPunishment(row: PunishmentRow): Punishment {
  return {
    id: row.id,
    kidId: row.kid_id,
    punishmentTypeId: row.punishment_type_id,
    name: row.name,
    coinAmount: row.coin_amount,
    icon: { emoji: row.icon_emoji, photoUri: row.icon_photo_uri },
    dayKey: row.day_key,
    createdAt: row.created_at,
  };
}

export async function listPunishments(
  db: SQLiteDatabase,
  kidId: number,
  dayKey: string,
): Promise<Punishment[]> {
  const rows = await db.getAllAsync<PunishmentRow>(
    `${SELECT_PUNISHMENT} WHERE p.kid_id = ? AND p.day_key = ? ORDER BY p.created_at, p.id`,
    kidId,
    dayKey,
  );
  return rows.map(toPunishment);
}

// The coins this change moved out of (or back into) the kid's savings. `changed`
// is false when nothing moved, such as a removal after the day has ended.
export type PunishmentChange = {
  changed: boolean;
  coins: number;
};

const UNCHANGED: PunishmentChange = { changed: false, coins: 0 };

// Logging and its savings change are saved together, like task ticks.
export function addPunishment(
  db: SQLiteDatabase,
  input: { kidId: number; punishmentType: PunishmentType; dayKey: string },
): Promise<PunishmentChange> {
  const { kidId, punishmentType, dayKey } = input;
  return queueWrite(async () => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO punishments (kid_id, punishment_type_id, name, coin_amount, day_key) VALUES (?, ?, ?, ?, ?)',
        kidId,
        punishmentType.id,
        punishmentType.name,
        punishmentType.coinAmount,
        dayKey,
      );
      await addToSavings(db, kidId, -punishmentType.coinAmount);
    });
    return { changed: true, coins: punishmentType.coinAmount };
  });
}

// Only entries from the current day can be removed. Once the day has ended the
// deduction stands, so the day key is checked in the same statement.
export function removePunishment(
  db: SQLiteDatabase,
  input: { punishmentId: number; kidId: number; dayKey: string },
): Promise<PunishmentChange> {
  const { punishmentId, kidId, dayKey } = input;
  return queueWrite(async () => {
    let change = UNCHANGED;
    await db.withTransactionAsync(async () => {
      const row = await db.getFirstAsync<{ coin_amount: number }>(
        'SELECT coin_amount FROM punishments WHERE id = ? AND kid_id = ? AND day_key = ?',
        punishmentId,
        kidId,
        dayKey,
      );
      if (!row) return;
      await db.runAsync(
        'DELETE FROM punishments WHERE id = ? AND kid_id = ? AND day_key = ?',
        punishmentId,
        kidId,
        dayKey,
      );
      await addToSavings(db, kidId, row.coin_amount);
      change = { changed: true, coins: row.coin_amount };
    });
    return change;
  });
}
