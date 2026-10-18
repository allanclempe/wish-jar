import { DurableObject } from 'cloudflare:workers';

// How many new families every caller together may start in a UTC day
// (WJ-57), so new families fit in the Free plan's 5 GB of storage, shared by
// every family. Families that start past this get 429 until 00:00 UTC;
// families already started are never touched. apps/api/README.md has the sum
// (test/limits.test.ts checks it). Only a start that goes through counts.
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

  // A start take() counted that didn't go through.
  async giveBack(): Promise<void> {
    const day = Math.floor(Date.now() / DAY_MS);
    const kept = await this.ctx.storage.get<Count>(KEY);
    if (kept?.day === day && kept.count > 0) await this.ctx.storage.put<Count>(KEY, { day, count: kept.count - 1 });
  }
}

export const FAMILY_STARTS_NAME = 'everyone';

// Null when the family may start, or how many seconds it has to wait.
export async function takeFamilyStart(env: Env): Promise<number | null> {
  return env.FAMILY_STARTS.getByName(FAMILY_STARTS_NAME).take();
}

export async function giveBackFamilyStart(env: Env): Promise<void> {
  await env.FAMILY_STARTS.getByName(FAMILY_STARTS_NAME).giveBack();
}
