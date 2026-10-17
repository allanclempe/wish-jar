import { DurableObject } from 'cloudflare:workers';

// A value can't pass 2 MB in a Durable Object's storage, so a snapshot is kept
// in chunks under it.
const CHUNK_BYTES = 1024 * 1024;

type Meta = { size: number; chunks: number; savedAt: number };

// The Echo Show's database (WJ-45): its web view drops every byte of storage
// when the skill session ends, so Wish Jar keeps a copy of its SQLite file
// here and restores it at the next launch. One per device, named after a hash
// of the device's Alexa id (src/backups.ts), holding the newest snapshot only.
// The bytes are opaque: the device sends them already compressed.
export class JarBackup extends DurableObject<Env> {
  async load(): Promise<ArrayBuffer | null> {
    const meta = await this.ctx.storage.get<Meta>('meta');
    if (!meta) return null;
    const keys = Array.from({ length: meta.chunks }, (_, i) => chunkKey(i));
    const chunks = await this.ctx.storage.get<ArrayBuffer>(keys);
    const body = new Uint8Array(meta.size);
    let offset = 0;
    for (const key of keys) {
      const chunk = chunks.get(key);
      if (!chunk) return null;
      body.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    return body.buffer;
  }

  async save(snapshot: ArrayBuffer): Promise<void> {
    const entries: Record<string, ArrayBuffer | Meta> = {};
    let chunks = 0;
    for (let offset = 0; offset < snapshot.byteLength; offset += CHUNK_BYTES) {
      entries[chunkKey(chunks)] = snapshot.slice(offset, offset + CHUNK_BYTES);
      chunks += 1;
    }
    entries.meta = { size: snapshot.byteLength, chunks, savedAt: Date.now() };

    // All or nothing, so a load never mixes chunks of two snapshots.
    await this.ctx.storage.transaction(async (txn) => {
      const before = await txn.get<Meta>('meta');
      await txn.put(entries);
      for (let i = chunks; i < (before?.chunks ?? 0); i++) await txn.delete(chunkKey(i));
    });
  }
}

function chunkKey(index: number): string {
  return `chunk:${index}`;
}
