import { first, run, type Db } from './sql';

// Whether the family has been seen today yet, for the family_active count
// (WJ-82, src/usage.ts), so a family counts once a day however many calls its
// devices make. The day is the UTC day, as with the daily writes
// (dailyWrites.ts). It's kept in jar_meta, one row written a day, as the jar
// forgets its memory whenever it sleeps; what's kept is only the day number.
const KEY = 'active_day';
const DAY_MS = 24 * 60 * 60_000;

export class ActiveDay {
  // The day last marked, once read or written since the jar woke up.
  private day: number | null = null;

  constructor(private readonly db: Db) {}

  // True the first time it's asked on a UTC day, and marks the day.
  firstToday(now: number): boolean {
    const today = Math.floor(now / DAY_MS);
    if (this.day === null) {
      const row = first<{ value: string }>(this.db, 'SELECT value FROM jar_meta WHERE key = ?', KEY);
      this.day = row ? Number(row.value) : -1;
    }
    if (this.day >= today) return false;
    this.day = today;
    run(
      this.db,
      'INSERT INTO jar_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      KEY,
      String(today),
    );
    return true;
  }
}
