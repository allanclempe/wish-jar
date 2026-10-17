import type { FamilyJar } from './jar';

// Coins a grown-up gives for something special outside the tasks. Only the
// savings change is kept: a bonus has no record of its own.
export async function giveBonusCoins(
  jar: FamilyJar,
  input: { kidId: number; coins: number },
): Promise<void> {
  await jar.call('giveBonusCoins', input);
}
