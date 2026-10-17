import { DurableObject } from 'cloudflare:workers';

// What a code holds: the device's secret, when it runs out, and the photo once
// the phone sends it.
type Drop = { token: string; expiresAt: number; photo?: ArrayBuffer };

// open: waiting for a photo. sent: the photo is here, waiting for the device.
// gone: no such code, it ran out, or the device already took its photo.
export type DropState = 'open' | 'sent' | 'gone';

// One per code, named after it. Strongly consistent, unlike KV (whose reads can
// lag a minute), so the device sees the photo as soon as the phone sends it.
// Everything is dropped when the code runs out (the alarm) or the device
// collects the photo.
export class PhotoDrop extends DurableObject<Env> {
  // False when the code is already taken, so the Worker draws another.
  async open(token: string, expiresAt: number): Promise<boolean> {
    if (await this.current()) return false;
    await this.ctx.storage.put<Drop>('drop', { token, expiresAt });
    await this.ctx.storage.setAlarm(expiresAt);
    return true;
  }

  async state(): Promise<DropState> {
    const drop = await this.current();
    if (!drop) return 'gone';
    return drop.photo ? 'sent' : 'open';
  }

  // Keeps the phone's photo when the code is open; the state it was in.
  async send(photo: ArrayBuffer): Promise<DropState> {
    const drop = await this.current();
    if (!drop) return 'gone';
    if (drop.photo) return 'sent';
    await this.ctx.storage.put<Drop>('drop', { ...drop, photo });
    return 'open';
  }

  // The photo, handed over once: the code is dropped with it.
  async collect(token: string): Promise<ArrayBuffer | 'waiting' | 'forbidden' | 'gone'> {
    const drop = await this.current();
    if (!drop) return 'gone';
    if (!sameSecret(drop.token, token)) return 'forbidden';
    if (!drop.photo) return 'waiting';
    await this.drop();
    return drop.photo;
  }

  // The device gave up waiting (Cancel).
  async close(token: string): Promise<'closed' | 'forbidden' | 'gone'> {
    const drop = await this.current();
    if (!drop) return 'gone';
    if (!sameSecret(drop.token, token)) return 'forbidden';
    await this.drop();
    return 'closed';
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  // Alarms can run a little late, so the expiry is checked here too.
  private async current(): Promise<Drop | null> {
    const drop = await this.ctx.storage.get<Drop>('drop');
    return drop && Date.now() < drop.expiresAt ? drop : null;
  }

  private async drop(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

function sameSecret(expected: string, given: string): boolean {
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}
