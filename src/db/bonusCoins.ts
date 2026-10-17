import type { SQLiteDatabase } from 'expo-sqlite';

import { addToSavings, queueWrite } from './completions';

// Coins a grown-up gives for something special outside the tasks. Only the
// savings change is kept: a bonus has no record of its own.
export function giveBonusCoins(
  db: SQLiteDatabase,
  input: { kidId: number; coins: number },
): Promise<void> {
  return queueWrite(() => addToSavings(db, input.kidId, input.coins));
}
