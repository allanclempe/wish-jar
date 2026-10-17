import type { Consequence, ConsequenceChange, ConsequenceType } from './api';
import { addToSavings } from './completions';
import { all, type Db, first } from './sql';

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

export function listConsequences(db: Db, kidId: number, dayKey: string): Consequence[] {
  return all<ConsequenceRow>(
    db,
    `${SELECT_CONSEQUENCE} WHERE c.kid_id = ? AND c.day_key = ? ORDER BY c.created_at, c.id`,
    kidId,
    dayKey,
  ).map(toConsequence);
}

const UNCHANGED: ConsequenceChange = { changed: false, coins: 0 };

// Logging and its savings change are saved together, like task ticks. The name
// and coins are copied from the type as the jar has it (another device may
// have edited it); a type deleted meanwhile logs nothing.
export function addConsequence(
  db: Db,
  input: { kidId: number; consequenceType: Pick<ConsequenceType, 'id'>; dayKey: string },
): ConsequenceChange {
  const { kidId, consequenceType, dayKey } = input;
  return db.transactionSync(() => {
    const added = first<{ coin_amount: number }>(
      db,
      `INSERT INTO consequences (kid_id, consequence_type_id, name, coin_amount, day_key)
        SELECT ?, id, name, coin_amount, ? FROM consequence_types WHERE id = ?
        RETURNING coin_amount`,
      kidId,
      dayKey,
      consequenceType.id,
    );
    if (!added) return UNCHANGED;
    addToSavings(db, kidId, -added.coin_amount);
    return { changed: true, coins: added.coin_amount };
  });
}

// Only entries from the current day can be removed. Once the day has ended the
// deduction stands, so the day key is checked in the same statement.
export function removeConsequence(
  db: Db,
  input: { consequenceId: number; kidId: number; dayKey: string },
): ConsequenceChange {
  const { consequenceId, kidId, dayKey } = input;
  return db.transactionSync(() => {
    const removed = first<{ coin_amount: number }>(
      db,
      'DELETE FROM consequences WHERE id = ? AND kid_id = ? AND day_key = ? RETURNING coin_amount',
      consequenceId,
      kidId,
      dayKey,
    );
    if (!removed) return UNCHANGED;
    addToSavings(db, kidId, removed.coin_amount);
    return { changed: true, coins: removed.coin_amount };
  });
}
