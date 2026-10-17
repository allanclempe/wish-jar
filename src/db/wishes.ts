import type { FamilyJar } from './jar';
import type { Icon, Wish } from './types';

export function listWishes(jar: FamilyJar): Promise<Wish[]> {
  return jar.call('listWishes');
}

export function getWish(jar: FamilyJar, wishId: number): Promise<Wish | null> {
  return jar.call('getWish', wishId);
}

export function insertWish(
  jar: FamilyJar,
  input: { kidId: number; name: string; coinAmount: number; icon: Icon },
): Promise<number> {
  return jar.call('insertWish', input);
}

// Returns the wish's previous photo, which the jar deletes itself once nothing
// shows it (photos.ts).
export function updateWish(
  jar: FamilyJar,
  wishId: number,
  input: { kidId: number; name: string; coinAmount: number; icon: Icon },
): Promise<string | null> {
  return jar.call('updateWish', wishId, input);
}

// A claimed wish's coins stay spent. Returns the wish's photo, which the jar
// deletes itself (photos.ts).
export function deleteWish(jar: FamilyJar, wishId: number): Promise<string | null> {
  return jar.call('deleteWish', wishId);
}

// The coins a claim took from the kid's savings. `changed` is false when the
// wish was already claimed or the kid no longer has enough coins for it.
export type WishClaim = {
  changed: boolean;
  coins: number;
};

// Marks the wish handed over and takes its coins in one go; the jar checks the
// balance as it does, so a claim can't overdraw the kid.
export function claimWish(jar: FamilyJar, input: { wishId: number; kidId: number }): Promise<WishClaim> {
  return jar.call('claimWish', input);
}
