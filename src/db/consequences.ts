import type { SQLiteDatabase } from 'expo-sqlite';

import { addToSavings, queueWrite } from './completions';
import type { Consequence, ConsequenceType } from './types';

type ConsequenceRow = {
  id: number;
  kid_id: number;
  consequence_type_id: number | null;
  name: string;
  coin_amount: number;
  icon_emoji: string | null;
  icon_photo_uri: string | null;
  day_key: string;
  created_at: number;
};

// The icon comes from the type, so an edited icon shows on earlier entries too.
const SELECT_CONSEQUENCE = `
  SELECT c.id, c.kid_id, c.consequence_type_id, c.name, c.coin_amount,
    t.icon_emoji, t.icon_photo_uri, c.day_key, c.created_at
  FROM consequences c
  LEFT JOIN consequence_types t ON t.id = c.consequence_type_id
`;

function toConsequence(row: ConsequenceRow): Consequence {
  return {
    id: row.id,
    kidId: row.kid_id,
    consequenceTypeId: row.consequence_type_id,
    name: row.name,
    coinAmount: row.coin_amount,
    icon: { emoji: row.icon_emoji, photoUri: row.icon_photo_uri },
    dayKey: row.day_key,
    createdAt: row.created_at,
  };
}

export async function listConsequences(
  db: SQLiteDatabase,
  kidId: number,
  dayKey: string,
): Promise<Consequence[]> {
  const rows = await db.getAllAsync<ConsequenceRow>(
    `${SELECT_CONSEQUENCE} WHERE c.kid_id = ? AND c.day_key = ? ORDER BY c.created_at, c.id`,
    kidId,
    dayKey,
  );
  return rows.map(toConsequence);
}

// The coins this change moved out of (or back into) the kid's savings. `changed`
// is false when nothing moved, such as a removal after the day has ended.
export type ConsequenceChange = {
  changed: boolean;
  coins: number;
};

const UNCHANGED: ConsequenceChange = { changed: false, coins: 0 };

// Logging and its savings change are saved together, like task ticks.
export function addConsequence(
  db: SQLiteDatabase,
  input: { kidId: number; consequenceType: ConsequenceType; dayKey: string },
): Promise<ConsequenceChange> {
  const { kidId, consequenceType, dayKey } = input;
  return queueWrite(async () => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO consequences (kid_id, consequence_type_id, name, coin_amount, day_key) VALUES (?, ?, ?, ?, ?)',
        kidId,
        consequenceType.id,
        consequenceType.name,
        consequenceType.coinAmount,
        dayKey,
      );
      await addToSavings(db, kidId, -consequenceType.coinAmount);
    });
    return { changed: true, coins: consequenceType.coinAmount };
  });
}

// Only entries from the current day can be removed. Once the day has ended the
// deduction stands, so the day key is checked in the same statement.
export function removeConsequence(
  db: SQLiteDatabase,
  input: { consequenceId: number; kidId: number; dayKey: string },
): Promise<ConsequenceChange> {
  const { consequenceId, kidId, dayKey } = input;
  return queueWrite(async () => {
    let change = UNCHANGED;
    await db.withTransactionAsync(async () => {
      const row = await db.getFirstAsync<{ coin_amount: number }>(
        'SELECT coin_amount FROM consequences WHERE id = ? AND kid_id = ? AND day_key = ?',
        consequenceId,
        kidId,
        dayKey,
      );
      if (!row) return;
      await db.runAsync(
        'DELETE FROM consequences WHERE id = ? AND kid_id = ? AND day_key = ?',
        consequenceId,
        kidId,
        dayKey,
      );
      await addToSavings(db, kidId, row.coin_amount);
      change = { changed: true, coins: row.coin_amount };
    });
    return change;
  });
}
