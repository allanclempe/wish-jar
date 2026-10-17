import type { FamilyJar } from './jar';
import type { Consequence, ConsequenceType } from './types';

// The icon comes from the type, so an edited icon shows on earlier entries too.
export function listConsequences(jar: FamilyJar, kidId: number, dayKey: string): Promise<Consequence[]> {
  return jar.call('listConsequences', kidId, dayKey);
}

// The coins this change moved out of (or back into) the kid's savings. `changed`
// is false when nothing moved, such as a removal after the day has ended.
export type ConsequenceChange = {
  changed: boolean;
  coins: number;
};

// Logging and its savings change are saved together, like task ticks. The
// name and coins are the type's as the jar has it.
export function addConsequence(
  jar: FamilyJar,
  input: { kidId: number; consequenceType: ConsequenceType; dayKey: string },
): Promise<ConsequenceChange> {
  return jar.call('addConsequence', input);
}

// Only entries from the current day can be removed. Once the day has ended the
// deduction stands.
export function removeConsequence(
  jar: FamilyJar,
  input: { consequenceId: number; kidId: number; dayKey: string },
): Promise<ConsequenceChange> {
  return jar.call('removeConsequence', input);
}
