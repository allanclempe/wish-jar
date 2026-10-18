import { DurableObject } from 'cloudflare:workers';

// What a join code holds: the family it lets a new device into, and when it
// runs out. Not the family's token: the new device gets one of its own.
type Join = { familyId: string; expiresAt: number };

// One per code, named after it, like PhotoDrop: a device of the family asks
// for it, and a new device claims it once to join (WJ-48). Everything is
// dropped when the code is claimed, closed or runs out (the alarm).
export class JoinCode extends DurableObject<Env> {
  // False when the code is already taken, so the Worker draws another.
  async open(familyId: string, expiresAt: number): Promise<boolean> {
    if (await this.current()) return false;
    await this.ctx.storage.put<Join>('join', { familyId, expiresAt });
    await this.ctx.storage.setAlarm(expiresAt);
    return true;
  }

  // The family to join, once: the code is dropped as it's handed over. Null
  // when there's no such code, it ran out, or it was used.
  async claim(): Promise<string | null> {
    const join = await this.current();
    if (!join) return null;
    await this.drop();
    return join.familyId;
  }

  // The parent closed the code before anyone used it.
  async close(familyId: string): Promise<'closed' | 'forbidden' | 'gone'> {
    const join = await this.current();
    if (!join) return 'gone';
    if (join.familyId !== familyId) return 'forbidden';
    await this.drop();
    return 'closed';
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  // Alarms can run a little late, so the expiry is checked here too.
  private async current(): Promise<Join | null> {
    const join = await this.ctx.storage.get<Join>('join');
    return join && Date.now() < join.expiresAt ? join : null;
  }

  private async drop(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

// Wrong codes a caller (by IP address) may try before it's made to wait. A
// code is one of 31^6, so guessing one in its 10 minutes at this pace is
// hopeless; a parent mistyping a few times never gets near it.
export const MAX_JOIN_MISSES = 10;
export const JOIN_MISSES_WINDOW_MS = 15 * 60_000;

type Misses = { count: number; until: number };

// One per IP address that has typed a wrong code, counting its misses. It
// forgets them when the window ends (the alarm).
//
// A try is counted before the code is checked, and given back if the code was
// right, so guesses sent at once can't all see the count before any of them
// adds to it (WJ-62). The count is read and written with the synchronous
// storage API (SQLite-backed objects have it), so nothing can run between the
// two; only the alarm is set after.
export class JoinAttempts extends DurableObject<Env> {
  // The window the try was counted in, or null when the caller has run out of
  // tries and must wait.
  async attempt(): Promise<number | null> {
    const misses = this.current();
    if (misses && misses.count >= MAX_JOIN_MISSES) return null;
    if (misses) {
      this.ctx.storage.kv.put<Misses>('misses', { ...misses, count: misses.count + 1 });
      return misses.until;
    }
    const until = Date.now() + JOIN_MISSES_WINDOW_MS;
    this.ctx.storage.kv.put<Misses>('misses', { count: 1, until });
    await this.ctx.storage.setAlarm(until);
    return until;
  }

  // The code was right: the try counted in that window isn't a miss. Nothing
  // to give back once the window has ended and another begun. The alarm is
  // left to go off on its own, so it can't race a new window's.
  async right(window: number): Promise<void> {
    const misses = this.current();
    if (!misses || misses.until !== window) return;
    if (misses.count > 1) this.ctx.storage.kv.put<Misses>('misses', { ...misses, count: misses.count - 1 });
    else this.ctx.storage.kv.delete('misses');
  }

  // Only a window that has ended: a new one may have begun before it ran.
  async alarm(): Promise<void> {
    if (!this.current()) this.ctx.storage.kv.delete('misses');
  }

  private current(): Misses | null {
    const misses = this.ctx.storage.kv.get<Misses>('misses');
    return misses && Date.now() < misses.until ? misses : null;
  }
}
