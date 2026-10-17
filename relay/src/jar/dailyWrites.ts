import { MAX_JAR_BYTES } from './limits';
import { first, run, type Db } from './sql';

// What one family may write in a day (WJ-56), as every family shares the one
// Free account's rows written a day. The day is the UTC day, as the Free
// plan's own allowance starts again at 00:00 UTC.
//
// A real family is nowhere near these: a tick is 3 rows, so several kids
// ticking all their tasks, a parent setting up the jar on its first day and
// the photos going up with it are a few hundred to a thousand rows and a few
// MB.
export const DAILY_WRITES = {
  // Rows the family's writes, removes and uploads write, as the Free plan
  // counts them (each statement's rowsWritten, indexes included). 5% of
  // the account's day.
  rows: 5_000,
  // Bytes of photos going up: POST /photos, and calls bringing data: URIs.
  // A whole jar's worth (MAX_JAR_BYTES, 10 MB) a day, so a family can fill
  // its jar on its first day; photos are 100 to 300 KB. What a jar keeps is
  // capped by its size; this caps a family putting photos up and deleting
  // them again.
  bytes: MAX_JAR_BYTES,
} as const;

// How far ahead of the count the kept one is. The count lives in memory: a
// row written for every call counted would add a third to what a tick costs.
// But the jar forgets its memory whenever it sleeps (as soon as 10 seconds
// after the last call, with only sockets open), so what's kept is the count
// rounded up by a step, written only when the count gets past it, and a jar
// that wakes up counts from there. A sleep costs a family a step of its
// budget at most, never gives one back; a kept count every 20 rows is 5% more
// rows written.
const STEP = { rows: 20, bytes: 1024 * 1024 } as const;

const KEY = 'daily_writes';
const DAY_MS = 24 * 60 * 60_000;

type Count = { day: number; rows: number; bytes: number };

export class DailyWrites {
  // What's been counted today, and what's kept (see STEP).
  private count: Count | null = null;
  private kept: Count | null = null;

  constructor(private readonly db: Db) {}

  // Null while the family may write, or how many seconds until it may again
  // (00:00 UTC).
  wait(now: number): number | null {
    const count = this.today(now);
    if (count.rows < DAILY_WRITES.rows && count.bytes < DAILY_WRITES.bytes) return null;
    return Math.max(1, Math.ceil(((count.day + 1) * DAY_MS - now) / 1000));
  }

  // Counts what a write wrote. It's let through whatever it brings, as long
  // as the family was under its budget: one call is a few rows, and its
  // photos are capped (MAX_CALL_BYTES).
  add(now: number, rows: number, bytes: number): void {
    const count = this.today(now);
    count.rows += rows;
    count.bytes += bytes;
    const kept = this.kept ?? { day: count.day, rows: 0, bytes: 0 };
    if (count.rows <= kept.rows && count.bytes <= kept.bytes) return;
    this.kept = {
      day: count.day,
      rows: count.rows <= kept.rows ? kept.rows : count.rows + STEP.rows,
      bytes: count.bytes <= kept.bytes ? kept.bytes : count.bytes + STEP.bytes,
    };
    run(
      this.db,
      'INSERT INTO jar_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      KEY,
      JSON.stringify(this.kept),
    );
  }

  // Today's count: from memory, or the kept one when the jar has just woken
  // up, or nothing on a new day.
  private today(now: number): Count {
    const day = Math.floor(now / DAY_MS);
    if (this.count?.day === day) return this.count;
    if (this.count === null) {
      const row = first<{ value: string }>(this.db, 'SELECT value FROM jar_meta WHERE key = ?', KEY);
      const kept = row ? (JSON.parse(row.value) as Count) : null;
      if (kept?.day === day) {
        this.kept = kept;
        this.count = { ...kept };
        return this.count;
      }
    }
    this.kept = null;
    this.count = { day, rows: 0, bytes: 0 };
    return this.count;
  }
}
