// Anonymous counts of how Wish Jar is used (WJ-82), in Workers Analytics
// Engine (the USAGE dataset, wrangler.jsonc). Each data point is only the
// event's name and a count of 1, with the time Analytics Engine adds: no
// family or device id, name, IP address or anything else that tells one
// family from another. README.md ("Usage counts") has the queries.
//
// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

export type UsageEvent =
  // A new family (POST /families).
  | 'family_started'
  // A grown-up deleted their family (DELETE /families).
  | 'family_deleted'
  // A family nobody used any more deleted itself (FamilyJar's alarm).
  | 'family_expired'
  // A family's first device seen on a UTC day (src/jar/activeDay.ts): how
  // many of them a day are daily active families.
  | 'family_active'
  // A device joined a family with a code (POST /devices/join).
  | 'device_joined'
  // A task ticked off (setTaskCompletion), not counting un-ticks.
  | 'task_ticked'
  // A kid got a wish (claimWish).
  | 'wish_claimed';

export function countUsage(env: Env, event: UsageEvent): void {
  try {
    // Written in the background, not awaited. The event is the index too,
    // so if Analytics Engine samples, it samples each event on its own.
    env.USAGE.writeDataPoint({ blobs: [event], doubles: [1], indexes: [event] });
  } catch (error) {
    // A count is never worth failing the request it's counting.
    console.warn('Usage count not written', event, error);
  }
}

// The event a successful jar call counts as, if any: a tick or a claimed
// wish that changed the jar (`changed`), not one already in that state.
export function callUsage(fn: unknown, args: unknown, result: unknown): UsageEvent | null {
  const changed = typeof result === 'object' && result !== null && (result as { changed?: unknown }).changed === true;
  if (!changed) return null;
  if (fn === 'claimWish') return 'wish_claimed';
  if (fn === 'setTaskCompletion' && Array.isArray(args)) {
    const input: unknown = args[0];
    if (typeof input === 'object' && input !== null && (input as { completed?: unknown }).completed === true) {
      return 'task_ticked';
    }
  }
  return null;
}
