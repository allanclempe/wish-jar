import type { FamilyJar } from './jar';
import type { ConsequenceType, Icon } from './types';

export function listConsequenceTypes(jar: FamilyJar): Promise<ConsequenceType[]> {
  return jar.call('listConsequenceTypes');
}

export function getConsequenceType(
  jar: FamilyJar,
  consequenceTypeId: number,
): Promise<ConsequenceType | null> {
  return jar.call('getConsequenceType', consequenceTypeId);
}

export function insertConsequenceType(
  jar: FamilyJar,
  input: { name: string; coinAmount: number; icon: Icon },
): Promise<number> {
  return jar.call('insertConsequenceType', input);
}

// Returns the type's previous photo, so the caller can remove it once replaced.
export function updateConsequenceType(
  jar: FamilyJar,
  consequenceTypeId: number,
  input: { name: string; coinAmount: number; icon: Icon },
): Promise<string | null> {
  return jar.call('updateConsequenceType', consequenceTypeId, input);
}

// Entries already logged keep their name and coins, and show the fallback
// icon from then on. Returns the type's photo, so the caller can remove it.
export function deleteConsequenceType(
  jar: FamilyJar,
  consequenceTypeId: number,
): Promise<string | null> {
  return jar.call('deleteConsequenceType', consequenceTypeId);
}
