import { loadActiveKidId, saveActiveKidId } from './device';
import type { FamilyJar } from './jar';

// The kid playing is kept on this device, not in the family jar: each of the
// family's devices may show a different kid.
export async function getActiveKidId(): Promise<number | null> {
  return loadActiveKidId();
}

export async function setActiveKidId(kidId: number): Promise<void> {
  await saveActiveKidId(kidId);
}

export const PIN_LENGTH = 3;

// The PIN and the sound are the family's, shared by its devices. Null while no
// grown-up has set a PIN: grown-up screens stay open until one does (WJ-71).
export function getParentPin(jar: FamilyJar): Promise<string | null> {
  return jar.call('findParentPin');
}

export async function setParentPin(jar: FamilyJar, pin: string): Promise<void> {
  await jar.call('setParentPin', pin);
}

// Whether ticks ding and the last one plays a fanfare. On until a grown-up
// turns it off.
export function getSoundEnabled(jar: FamilyJar): Promise<boolean> {
  return jar.call('getSoundEnabled');
}

export async function setSoundEnabled(jar: FamilyJar, enabled: boolean): Promise<void> {
  await jar.call('setSoundEnabled', enabled);
}
