import { DurableObject } from 'cloudflare:workers';

// One per Echo Show, named by the hash of its Alexa device id (echoShow.ts),
// never the id itself: which family the Show is in (WJ-45). The Show's
// browser storage is wiped at the end of every skill session, so it can't keep
// a token; at each launch it asks here for its family, and the family's jar
// gives its device row a new token.
//
// Only the family id is kept, and the hash of the Show's secret (WJ-60),
// which the Alexa skill keeps for it. The family's jar holds the same id hash
// on the Show's device row, so removing the device there ends the link even
// though this object still names the family.
//
// A Show linked before WJ-60, or whose skill sends no secret yet, has no hash
// here: its id alone rejoins, and the first rejoin with a secret keeps that
// secret's hash (trust on first use).
export class EchoShowLink extends DurableObject<Env> {
  // Whether a device of `familyId` may link the Show: always in the family
  // it's in (which has it anyway, and gets it back this way when the skill
  // loses its secret), and in another family only with the Show's secret.
  async mayLink(familyId: string, secretHash: string | null): Promise<boolean> {
    const [linkedTo, kept] = await this.read();
    return linkedTo == null || linkedTo === familyId || kept == null || sameHash(kept, secretHash);
  }

  // False when the Show can't move to `familyId` (mayLink). The secret sent
  // with the link is the one kept from then on, or none.
  async link(familyId: string, secretHash: string | null): Promise<boolean> {
    if (!(await this.mayLink(familyId, secretHash))) return false;
    await this.ctx.storage.put('familyId', familyId);
    if (secretHash) await this.ctx.storage.put('secretHash', secretHash);
    else await this.ctx.storage.delete('secretHash');
    return true;
  }

  // The Show's family, for a rejoin with this secret: null when it has none,
  // or another secret is kept for it, or one is and none was sent.
  async rejoin(secretHash: string | null): Promise<string | null> {
    const [familyId, kept] = await this.read();
    if (familyId == null) return null;
    if (kept == null) {
      if (secretHash) await this.ctx.storage.put('secretHash', secretHash);
      return familyId;
    }
    return sameHash(kept, secretHash) ? familyId : null;
  }

  async familyId(): Promise<string | null> {
    return (await this.read())[0];
  }

  // The family no longer has the Show (removed, or gone). Only that family's
  // link is dropped, its secret with it: the Show may have joined another one
  // meanwhile.
  async unlink(familyId: string): Promise<void> {
    if ((await this.familyId()) === familyId) await this.ctx.storage.deleteAll();
  }

  private async read(): Promise<[familyId: string | null, secretHash: string | null]> {
    const stored = await this.ctx.storage.get<string>(['familyId', 'secretHash']);
    return [stored.get('familyId') ?? null, stored.get('secretHash') ?? null];
  }
}

function sameHash(expected: string, given: string | null): boolean {
  if (given == null) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}
