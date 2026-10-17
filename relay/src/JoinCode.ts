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
export class JoinAttempts extends DurableObject<Env> {
  async blocked(): Promise<boolean> {
    const misses = await this.current();
    return misses != null && misses.count >= MAX_JOIN_MISSES;
  }

  async missed(): Promise<void> {
    const misses = await this.current();
    if (misses) {
      await this.ctx.storage.put<Misses>('misses', { ...misses, count: misses.count + 1 });
      return;
    }
    const until = Date.now() + JOIN_MISSES_WINDOW_MS;
    await this.ctx.storage.put<Misses>('misses', { count: 1, until });
    await this.ctx.storage.setAlarm(until);
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  private async current(): Promise<Misses | null> {
    const misses = await this.ctx.storage.get<Misses>('misses');
    return misses && Date.now() < misses.until ? misses : null;
  }
}
