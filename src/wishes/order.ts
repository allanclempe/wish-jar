import type { Wish } from '../db';

export type WishState = 'locked' | 'unlocked' | 'claimed';

export type WishProgress = {
  wish: Wish;
  state: WishState;
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

// A wish unlocks while the kid has enough coins for it, and stays claimed
// once a grown-up has handed it over.
export function wishState(wish: Wish, savings: number): WishState {
  if (wish.claimedAt != null) return 'claimed';
  return coinsStillNeeded(wish.coinAmount, savings) === 0 ? 'unlocked' : 'locked';
}

// Closest first: the wish with the fewest coins still needed comes first, and
// claimed wishes go to the end, most recent first.
export function orderWishes(wishes: Wish[], savings: number): WishProgress[] {
  return wishes
    .map((wish) => {
      const state = wishState(wish, savings);
      return {
        wish,
        state,
        coinsStillNeeded: state === 'claimed' ? 0 : coinsStillNeeded(wish.coinAmount, savings),
        progress: state === 'claimed' ? 1 : wishProgress(wish.coinAmount, savings),
      };
    })
    .sort((a, b) => {
      const aClaimed = a.state === 'claimed';
      const bClaimed = b.state === 'claimed';
      if (aClaimed !== bClaimed) return aClaimed ? 1 : -1;
      if (aClaimed) return (b.wish.claimedAt ?? 0) - (a.wish.claimedAt ?? 0);
      return a.coinsStillNeeded - b.coinsStillNeeded;
    });
}

// The unclaimed wishes a change in savings has just made affordable.
export function wishesUnlockedBy(wishes: Wish[], before: number, after: number): Wish[] {
  return wishes.filter(
    (wish) => wish.claimedAt == null && before < wish.coinAmount && wish.coinAmount <= after,
  );
}

// Whether two loads of the wishes are the same, so the wishes tab can keep
// what it has instead of re-rendering every card each time it is shown.
export function sameWishes(a: Wish[], b: Wish[]): boolean {
  return (
    a.length === b.length &&
    a.every((wish, i) => {
      const other = b[i];
      return (
        wish.id === other.id &&
        wish.kidId === other.kidId &&
        wish.name === other.name &&
        wish.coinAmount === other.coinAmount &&
        wish.icon.emoji === other.icon.emoji &&
        wish.icon.photoUri === other.icon.photoUri &&
        wish.createdAt === other.createdAt &&
        wish.claimedAt === other.claimedAt
      );
    })
  );
}
