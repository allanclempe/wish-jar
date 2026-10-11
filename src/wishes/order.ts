import type { Wish } from '../db';

export type WishProgress = {
  wish: Wish;
  coinsStillNeeded: number;
  progress: number;
};

export function coinsStillNeeded(coinAmount: number, savings: number): number {
  return Math.max(0, coinAmount - savings);
}

export function wishProgress(coinAmount: number, savings: number): number {
  if (coinAmount <= 0) return 1;
  return Math.min(1, Math.max(0, savings / coinAmount));
}

// Closest first: the wish with the fewest coins still needed comes first.
export function orderWishes(wishes: Wish[], savings: number): WishProgress[] {
  return wishes
    .map((wish) => ({
      wish,
      coinsStillNeeded: coinsStillNeeded(wish.coinAmount, savings),
      progress: wishProgress(wish.coinAmount, savings),
    }))
    .sort((a, b) => a.coinsStillNeeded - b.coinsStillNeeded);
}
