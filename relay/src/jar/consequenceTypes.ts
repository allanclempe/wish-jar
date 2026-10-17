import type { ConsequenceType, ConsequenceTypeInput } from './api';
import { all, type Db, first, insert, run } from './sql';

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

const SELECT_TYPE = 'SELECT id, name, coin_amount, icon_emoji, icon_photo_uri, created_at FROM consequence_types';

export function listConsequenceTypes(db: Db): ConsequenceType[] {
  return all<ConsequenceTypeRow>(db, `${SELECT_TYPE} ORDER BY created_at, id`).map(toConsequenceType);
}

export function getConsequenceType(db: Db, consequenceTypeId: number): ConsequenceType | null {
  const row = first<ConsequenceTypeRow>(db, `${SELECT_TYPE} WHERE id = ?`, consequenceTypeId);
  return row ? toConsequenceType(row) : null;
}

export function insertConsequenceType(db: Db, input: ConsequenceTypeInput): number {
  return insert(
    db,
    'INSERT INTO consequence_types (name, coin_amount, icon_emoji, icon_photo_uri) VALUES (?, ?, ?, ?)',
    input.name,
    input.coinAmount,
    input.icon.emoji,
    input.icon.photoUri,
  );
}

export function updateConsequenceType(
  db: Db,
  consequenceTypeId: number,
  input: ConsequenceTypeInput,
): string | null {
  const previous = first<{ icon_photo_uri: string | null }>(
    db,
    'SELECT icon_photo_uri FROM consequence_types WHERE id = ?',
    consequenceTypeId,
  );
  run(
    db,
    'UPDATE consequence_types SET name = ?, coin_amount = ?, icon_emoji = ?, icon_photo_uri = ? WHERE id = ?',
    input.name,
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
export function deleteConsequenceType(db: Db, consequenceTypeId: number): string | null {
  const row = first<{ icon_photo_uri: string | null }>(
    db,
    'DELETE FROM consequence_types WHERE id = ? RETURNING icon_photo_uri',
    consequenceTypeId,
  );
  return row?.icon_photo_uri ?? null;
}
