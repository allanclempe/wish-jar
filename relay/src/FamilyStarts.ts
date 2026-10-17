import { DurableObject } from 'cloudflare:workers';

// How many new families every caller together may start in a UTC day
// (WJ-57). The per-caller limit (src/CallerLimits.ts) and Turnstile stop one
// address, but a script with a few dozen addresses could still fill the Free
// plan's 5 GB of storage, shared by every family. Families that start past
// this get 429 until 00:00 UTC; families already started are never touched.
//
// What a script can store with it: a family nobody comes back to is deleted 7
// days after it was made (UNUSED_MS in src/FamilyJar.ts), and holds at most
// MAX_JAR_BYTES (10 MB) until then, its imported jar included. The families
// alive at any moment were made in the last 7 days, which touch 8 UTC days:
// 8 × 25 × 10 MB = 2 GB (2.1 GB as the Free plan counts, 10^9 bytes), well
// under half of the 5 GB, leaving the rest for the families in use. A family
// starts once (a try that failed halfway is one more), so 25 a day still
// leaves room for the real ones.
export const FAMILIES_PER_DAY = 25;

const KEY = 'started';
const DAY_MS = 24 * 60 * 60_000;

type Count = { day: number; count: number };

// The one instance (FAMILY_STARTS_NAME) counts the families started today.
// The count is read from storage each time: starting a family is rare, and the
// tests start from nothing by deleting it.
export class FamilyStarts extends DurableObject<Env> {
  // Counts one more, or how many seconds until 00:00 UTC when today's are
  // all started (that one isn't counted).
  async take(): Promise<number | null> {
    const now = Date.now();
    const day = Math.floor(now / DAY_MS);
    const kept = await this.ctx.storage.get<Count>(KEY);
    const count = kept?.day === day ? kept.count : 0;
    if (count >= FAMILIES_PER_DAY) return Math.max(1, Math.ceil(((day + 1) * DAY_MS - now) / 1000));
    await this.ctx.storage.put<Count>(KEY, { day, count: count + 1 });
    return null;
  }
}

export const FAMILY_STARTS_NAME = 'everyone';

// Null when the family may start, or how many seconds it has to wait.
export async function takeFamilyStart(env: Env): Promise<number | null> {
  return env.FAMILY_STARTS.getByName(FAMILY_STARTS_NAME).take();
}
