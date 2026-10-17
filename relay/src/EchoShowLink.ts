import { DurableObject } from 'cloudflare:workers';

// One per Echo Show, named by the hash of its Alexa device id (echoShow.ts),
// never the id itself: which family the Show is in (WJ-45). The Show's
// browser storage is wiped at the end of every skill session, so it can't keep
// a token; at each launch it asks here for its family, and the family's jar
// gives its device row a new token.
//
// Only the family id is kept. The family's jar holds the same hash on the
// Show's device row, so removing the device there ends the link even though
// this object still names the family.
export class EchoShowLink extends DurableObject<Env> {
  async link(familyId: string): Promise<void> {
    await this.ctx.storage.put('familyId', familyId);
  }

  async familyId(): Promise<string | null> {
    return (await this.ctx.storage.get<string>('familyId')) ?? null;
  }

  // The family no longer has the Show (removed, or gone). Only that family's
  // link is dropped: the Show may have joined another one meanwhile.
  async unlink(familyId: string): Promise<void> {
    if ((await this.familyId()) === familyId) await this.ctx.storage.deleteAll();
  }
}
