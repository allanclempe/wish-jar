// Ticking a task adds its coins to the kid's savings and un-ticking takes the
// same coins back out, so savings always match the completed tasks.
export function savingsAfterTask(savings: number, coinAmount: number, completed: boolean): number {
  return completed ? savings + coinAmount : savings - coinAmount;
}

// A bonus is at least one coin, and the stepper stops at a sensible top.
export const MAX_BONUS_COINS = 999;

export function clampBonusCoins(coins: number): number {
  return Math.min(MAX_BONUS_COINS, Math.max(1, Math.round(coins)));
}
