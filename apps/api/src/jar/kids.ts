import type { Kid, KidInput } from '@wish-jar/jar';
import { all, type Db, first, insert, run } from './sql';

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

export function listKids(db: Db): Kid[] {
  return all<KidRow>(db, 'SELECT id, name, photo_uri, created_at FROM kids ORDER BY created_at, id').map(
    toKid,
  );
}

export function getKid(db: Db, kidId: number): Kid | null {
  const row = first<KidRow>(db, 'SELECT id, name, photo_uri, created_at FROM kids WHERE id = ?', kidId);
  return row ? toKid(row) : null;
}

export function insertKid(db: Db, input: KidInput): number {
  return insert(db, 'INSERT INTO kids (name, photo_uri) VALUES (?, ?)', input.name, input.photoUri);
}

export function updateKid(db: Db, kidId: number, input: KidInput): string | null {
  const previous = first<{ photo_uri: string | null }>(db, 'SELECT photo_uri FROM kids WHERE id = ?', kidId);
  run(db, 'UPDATE kids SET name = ?, photo_uri = ? WHERE id = ?', input.name, input.photoUri, kidId);
  return previous?.photo_uri ?? null;
}

export function setKidPhoto(db: Db, kidId: number, photoUri: string | null): string | null {
  const previous = first<{ photo_uri: string | null }>(db, 'SELECT photo_uri FROM kids WHERE id = ?', kidId);
  run(db, 'UPDATE kids SET photo_uri = ? WHERE id = ?', photoUri, kidId);
  return previous?.photo_uri ?? null;
}

// Their wishes, ticks, consequences and savings go with them (ON DELETE
// CASCADE). Returns the photos left behind, so the caller can remove them.
export function deleteKid(db: Db, kidId: number): string[] {
  return db.transactionSync(() => {
    const rows = all<{ photo_uri: string | null }>(
      db,
      `SELECT photo_uri FROM kids WHERE id = ?
        UNION ALL SELECT icon_photo_uri FROM wishes WHERE kid_id = ?`,
      kidId,
      kidId,
    );
    run(db, 'DELETE FROM kids WHERE id = ?', kidId);
    return rows.flatMap((row) => (row.photo_uri ? [row.photo_uri] : []));
  });
}
