import type { FamilyJar } from './jar';
import type { Kid } from './types';

export function listKids(jar: FamilyJar): Promise<Kid[]> {
  return jar.call('listKids');
}

export function getKid(jar: FamilyJar, kidId: number): Promise<Kid | null> {
  return jar.call('getKid', kidId);
}

export function insertKid(
  jar: FamilyJar,
  input: { name: string; photoUri: string | null; emoji: string | null },
): Promise<number> {
  return jar.call('insertKid', input);
}

// Returns the previous photo, which the jar deletes itself once nothing shows
// it (photos.ts).
export function updateKid(
  jar: FamilyJar,
  kidId: number,
  input: { name: string; photoUri: string | null; emoji: string | null },
): Promise<string | null> {
  return jar.call('updateKid', kidId, input);
}

export function setKidPhoto(
  jar: FamilyJar,
  kidId: number,
  photoUri: string | null,
): Promise<string | null> {
  return jar.call('setKidPhoto', kidId, photoUri);
}

// Their wishes, ticks, consequences and savings go with them. Returns the
// photos left behind, which the jar deletes itself (photos.ts).
export function deleteKid(jar: FamilyJar, kidId: number): Promise<string[]> {
  return jar.call('deleteKid', kidId);
}
