import { randomToken } from '../codes';
import { MAX_JAR_PHOTO_BYTES } from './limits';
import { all, type Db, first, run } from './sql';

// The family's photos (WJ-49): one JPEG per row of the jar's own photos table,
// shown from GET /photos/<familyId>/<id>.jpg?sig=<signature>. The id is 32
// random bytes, so the URL itself is the secret an <img> can carry without a
// token; the signature (WJ-55, src/signing.ts) lets the Worker turn away a
// made-up URL without waking the jar. The kids', tasks', wishes' and
// consequence types' photo columns hold those URLs. URLs from before WJ-55
// have no signature; the jar signs the ones it keeps (signPhotoUrls).

const ID = '[A-Za-z0-9_-]{43}';
export const PHOTO_ID = new RegExp(`^${ID}$`);
// The query parameter with a photo URL's signature, an HMAC in URL-safe
// Base64 (as long as an id).
export const PHOTO_SIGNATURE = 'sig';
// A photo's URL, from any relay address, signed or not: only its id says
// which photo it is.
const PHOTO_URL = new RegExp(`/photos/${ID}/(${ID})\\.jpg(?:\\?${PHOTO_SIGNATURE}=${ID})?$`);

// Every column that may hold a photo.
const PHOTO_COLUMNS = [
  ['kids', 'photo_uri'],
  ['tasks', 'icon_photo_uri'],
  ['wishes', 'icon_photo_uri'],
  ['consequence_types', 'icon_photo_uri'],
] as const;

// The tables a photo shows in, whose rows change when one moves.
export const PHOTO_TABLES = PHOTO_COLUMNS.map(([table]) => table);

// An upload whose save never happened (the connection went mid-save) is kept
// this long before it counts as forgotten: long enough for any save in
// flight to land.
export const FORGOTTEN_AFTER_MS = 24 * 60 * 60_000;

export type StoredPhoto = { data: ArrayBuffer; type: string };

// The id of the jar photo `uri` points at, or null for anything else (a data:
// URI, a file on a phone).
export function photoId(uri: string | null | undefined): string | null {
  return uri?.match(PHOTO_URL)?.[1] ?? null;
}

// The photo's URL, given where the family's photos are served from
// (`${origin}/photos/${familyId}/`) and its signature.
export function photoUrl(base: string, id: string, signature: string): string {
  return `${base}${id}.jpg?${PHOTO_SIGNATURE}=${signature}`;
}

// A new photo's URL, from its id: photoUrl with the jar's signature
// (FamilyJar.photoUrls).
export type PhotoUrls = (id: string) => string;

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function addPhoto(db: Db, data: Uint8Array, type = 'image/jpeg'): string {
  const id = randomToken();
  // SQL takes a BLOB as an ArrayBuffer of its own.
  const blob = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  run(db, 'INSERT INTO photos (id, type, data) VALUES (?, ?, ?)', id, type, blob);
  return id;
}

export function readPhoto(db: Db, id: string): StoredPhoto | null {
  return first<StoredPhoto>(db, 'SELECT data, type FROM photos WHERE id = ?', id);
}

// Whether a kid, task, wish or consequence type still shows the photo, by a
// URL signed or not: the id is 43 random characters, so it's found nowhere
// else. One query per table: a Durable Object's SQLite allows few UNION terms.
function inUse(db: Db, id: string): boolean {
  const name = `/${id}.jpg`;
  return PHOTO_COLUMNS.some(
    ([table, column]) => first(db, `SELECT 1 FROM ${table} WHERE instr(${column}, ?) > 0 LIMIT 1`, name) != null,
  );
}

// Deletes the jar photos among `uris` that nothing shows any more: the photo
// a save replaced, or the ones a deleted kid left behind. The ids deleted.
export function dropPhotos(db: Db, uris: readonly (string | null)[]): string[] {
  const dropped: string[] = [];
  for (const id of new Set(uris.map(photoId))) {
    if (id && !inUse(db, id) && first(db, 'DELETE FROM photos WHERE id = ? RETURNING id', id)) {
      dropped.push(id);
    }
  }
  return dropped;
}

// An upload the device didn't save after all. A photo something shows stays.
export function deletePhoto(db: Db, id: string): 'deleted' | 'in use' | 'gone' {
  if (!first(db, 'SELECT 1 FROM photos WHERE id = ?', id)) return 'gone';
  if (inUse(db, id)) return 'in use';
  run(db, 'DELETE FROM photos WHERE id = ?', id);
  return 'deleted';
}

// Points everything that shows `from` at `to` instead. How many rows changed.
export function replacePhoto(db: Db, from: string, to: string): number {
  let changed = 0;
  for (const [table, column] of PHOTO_COLUMNS) {
    changed += all(db, `UPDATE ${table} SET ${column} = ? WHERE ${column} = ? RETURNING 1`, to, from).length;
  }
  return changed;
}

// Uploads nothing came to show after FORGOTTEN_AFTER_MS. The ids deleted.
export function sweepPhotos(db: Db, now: number): string[] {
  const shown = new Set<string>();
  for (const [table, column] of PHOTO_COLUMNS) {
    for (const row of all<{ uri: string }>(db, `SELECT ${column} AS uri FROM ${table} WHERE ${column} IS NOT NULL`)) {
      const id = photoId(row.uri);
      if (id) shown.add(id);
    }
  }
  const old = all<{ id: string }>(db, 'SELECT id FROM photos WHERE created_at < ?', now - FORGOTTEN_AFTER_MS);
  const forgotten = old.map((row) => row.id).filter((id) => !shown.has(id));
  for (const id of forgotten) run(db, 'DELETE FROM photos WHERE id = ?', id);
  return forgotten;
}

// The image types a web browser may have put in a data: URI, and how each
// file starts.
const DATA_URI = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/;
const MAGIC: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': isJpeg,
  'image/png': (bytes) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
  'image/gif': (bytes) => String.fromCharCode(...bytes.subarray(0, 4)) === 'GIF8',
  'image/webp': (bytes) => String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP',
};

function fromDataUri(uri: string): { data: Uint8Array; type: string } | null {
  const match = uri.match(DATA_URI);
  if (!match) return null;
  let binary: string;
  try {
    binary = atob(match[2].replace(/\s/g, ''));
  } catch {
    return null;
  }
  if (binary.length === 0 || binary.length > MAX_JAR_PHOTO_BYTES) return null;
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index);
  return MAGIC[match[1]](data) ? { data, type: match[1] } : null;
}

// Photos kept as data: URIs in the rows themselves (Wish Jar on the web,
// before WJ-49) move into the photos table, and the rows get their URL. The
// same picture used twice becomes one photo. One that isn't a picture the
// browser could show is left as it is. How many rows changed.
export function moveDataPhotos(db: Db, urls: PhotoUrls): number {
  const uris = new Set<string>();
  for (const [table, column] of PHOTO_COLUMNS) {
    for (const row of all<{ uri: string }>(db, `SELECT ${column} AS uri FROM ${table} WHERE ${column} LIKE 'data:%'`)) {
      uris.add(row.uri);
    }
  }
  let changed = 0;
  for (const uri of uris) {
    const photo = fromDataUri(uri);
    if (photo) changed += replacePhoto(db, uri, urls(addPhoto(db, photo.data, photo.type)));
  }
  return changed;
}

// The family's own photo URLs from before WJ-55, kept in its rows, get their
// signature, so they still show once unsigned URLs are turned away
// (UNSIGNED_UNTIL in src/signing.ts). A URL to another family's photo is left
// as it is. How many rows changed.
export function signPhotoUrls(db: Db, familyId: string, signature: (id: string) => string): number {
  const unsigned = new RegExp(`/photos/${familyId}/(${ID})\\.jpg$`);
  let changed = 0;
  for (const [table, column] of PHOTO_COLUMNS) {
    const rows = all<{ uri: string }>(
      db,
      `SELECT DISTINCT ${column} AS uri FROM ${table} WHERE ${column} LIKE '%.jpg'`,
    );
    for (const { uri } of rows) {
      const id = uri.match(unsigned)?.[1];
      if (!id) continue;
      const signed = `${uri}?${PHOTO_SIGNATURE}=${signature(id)}`;
      changed += all(db, `UPDATE ${table} SET ${column} = ? WHERE ${column} = ? RETURNING 1`, signed, uri).length;
    }
  }
  return changed;
}
