import { DurableObject } from 'cloudflare:workers';

import { findCall } from './jar/calls';
import { importJar } from './jar/importJar';
import { MAX_JAR_BYTES } from './jar/limits';
import { isJar, migrateJar, STARTER_CONSEQUENCE_TYPES } from './jar/schema';
import { all, insert, run } from './jar/sql';
import { JarError, label, record } from './jar/validate';

// What the Worker gets back: the result, or the status and why.
export type JarOutcome =
  | { ok: true; result: unknown }
  | { ok: false; status: 400 | 401 | 409 | 507; error: string };

// A device's last_seen_at is only written this often, so a device that reads
// the jar all day doesn't spend the Free plan's daily writes on it.
const SEEN_EVERY_MS = 10 * 60_000;

// One per family, named by its id: the family's whole jar in its own SQLite.
// A Durable Object runs one call at a time and its SQL runs synchronously, so
// writes from all of a family's devices land one after another.
export class FamilyJar extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Before any call, so every call sees the current tables.
    if (isJar(ctx.storage)) migrateJar(ctx.storage);
  }

  // Sets up a new family with its first device, from an existing jar when
  // `request.jar` is given (see CreateFamilyRequest).
  async create(secret: string, request: unknown): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    if (isJar(storage)) return { ok: false, status: 409, error: 'Family already exists' };
    return outcome(() =>
      storage.transactionSync(() => {
        const body = record(request, 'body');
        const device = label(body.label);
        migrateJar(storage);
        if (body.jar === undefined) storage.sql.exec(STARTER_CONSEQUENCE_TYPES);
        else importJar(storage, body.jar);
        insert(storage, 'INSERT INTO devices (secret_hash, label) VALUES (?, ?)', hash, device);
        return null;
      }),
    );
  }

  // Runs one allowlisted function for a device holding `secret`.
  async call(secret: string, fn: unknown, args: unknown): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    if (!isJar(storage) || !this.seen(hash)) {
      return { ok: false, status: 401, error: 'Not a device of this family' };
    }
    return outcome(() => {
      const found = findCall(fn, args);
      if (found.call.kind === 'write' && storage.sql.databaseSize >= MAX_JAR_BYTES) {
        throw new JarError(507, 'The jar is full: delete something first');
      }
      return found.call.run(storage, found.args);
    });
  }

  // Whether the hash is one of the family's devices, checking every one in
  // constant time so the reply's timing gives nothing away.
  private seen(hash: string): boolean {
    const devices = all<{ id: number; secret_hash: string; last_seen_at: number }>(
      this.ctx.storage,
      'SELECT id, secret_hash, last_seen_at FROM devices',
    );
    let match: (typeof devices)[number] | null = null;
    for (const device of devices) {
      if (sameHash(device.secret_hash, hash)) match = device;
    }
    if (!match) return false;
    const now = Date.now();
    if (now - match.last_seen_at >= SEEN_EVERY_MS) {
      run(this.ctx.storage, 'UPDATE devices SET last_seen_at = ? WHERE id = ?', now, match.id);
    }
    return true;
  }
}

// The function's result, or the refusal it threw. A broken constraint (a wish
// for a kid that isn't there) is the caller's mistake, so it's a 400 too.
function outcome(work: () => unknown): JarOutcome {
  try {
    return { ok: true, result: work() ?? null };
  } catch (error) {
    if (error instanceof JarError) return { ok: false, status: error.status, error: error.message };
    if (error instanceof Error && error.message.includes('SQLITE_CONSTRAINT')) {
      return { ok: false, status: 400, error: "That doesn't fit the jar" };
    }
    throw error;
  }
}

async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameHash(expected: string, given: string): boolean {
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}
