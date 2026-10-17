import { DurableObject } from 'cloudflare:workers';

import type { Device } from './jar/api';
import { findCall } from './jar/calls';
import { importJar } from './jar/importJar';
import { MAX_JAR_BYTES } from './jar/limits';
import { isJar, migrateJar, STARTER_CONSEQUENCE_TYPES } from './jar/schema';
import { all, first, insert, run } from './jar/sql';
import { id, JarError, type JarErrorStatus, label, record } from './jar/validate';

// What the Worker gets back: the result, or the status and why.
export type JarOutcome =
  | { ok: true; result: unknown }
  | { ok: false; status: JarErrorStatus; error: string };

const NOT_A_DEVICE: JarOutcome = { ok: false, status: 401, error: 'Not a device of this family' };

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
    if (!isJar(storage) || this.seen(hash) == null) return NOT_A_DEVICE;
    return outcome(() => {
      const found = findCall(fn, args);
      if (found.call.kind === 'write' && storage.sql.databaseSize >= MAX_JAR_BYTES) {
        throw new JarError(507, 'The jar is full: delete something first');
      }
      return found.call.run(storage, found.args);
    });
  }

  // Whether `secret` is one of the family's devices, before the Worker hands
  // out a join code for it.
  async check(secret: string): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    if (!isJar(this.ctx.storage) || this.seen(hash) == null) return NOT_A_DEVICE;
    return { ok: true, result: null };
  }

  // A new device, joining with a code the Worker has already claimed for this
  // family (WJ-48). 410 when the family is gone meanwhile.
  async addDevice(secret: string, deviceLabel: unknown): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    if (!isJar(storage)) return { ok: false, status: 410, error: 'That family jar is gone' };
    return outcome(() => {
      insert(storage, 'INSERT INTO devices (secret_hash, label) VALUES (?, ?)', hash, label(deviceLabel));
      return null;
    });
  }

  // Marks the device holding `secret` as the Echo Show whose Alexa device id
  // hashes to `echoShowHash` (WJ-45), so it can rejoin at its next launch. A
  // row that had it before (the Show's earlier place in this family) lets go.
  async linkEchoShow(secret: string, echoShowHash: string): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    const self = isJar(storage) ? this.seen(hash) : null;
    if (self == null) return NOT_A_DEVICE;
    storage.transactionSync(() => {
      run(
        storage,
        'UPDATE devices SET echo_show_hash = NULL WHERE echo_show_hash = ? AND id != ?',
        echoShowHash,
        self,
      );
      run(storage, 'UPDATE devices SET echo_show_hash = ? WHERE id = ?', echoShowHash, self);
    });
    return { ok: true, result: null };
  }

  // A new token for the Echo Show's device row, at the start of a skill
  // session: `secret` replaces the one it had, so last session's token opens
  // nothing now. 404 when no row has the Show (a parent removed it, or the
  // family is gone).
  async rejoinEchoShow(echoShowHash: string, secret: string): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    const notHere: JarOutcome = { ok: false, status: 404, error: 'This Echo Show is not in the family' };
    if (!isJar(storage)) return notHere;
    const row = first<{ id: number }>(
      storage,
      'SELECT id FROM devices WHERE echo_show_hash = ?',
      echoShowHash,
    );
    if (!row) return notHere;
    run(
      storage,
      'UPDATE devices SET secret_hash = ?, last_seen_at = ? WHERE id = ?',
      hash,
      Date.now(),
      row.id,
    );
    return { ok: true, result: null };
  }

  // Every device of the family, oldest first, for a device of the family.
  async listDevices(secret: string): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    const self = isJar(storage) ? this.seen(hash) : null;
    if (self == null) return NOT_A_DEVICE;
    const rows = all<{ id: number; label: string | null; created_at: number; last_seen_at: number }>(
      storage,
      'SELECT id, label, created_at, last_seen_at FROM devices ORDER BY created_at, id',
    );
    const devices: Device[] = rows.map((row) => ({
      id: row.id,
      label: row.label,
      addedAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      thisDevice: row.id === self,
    }));
    return { ok: true, result: devices };
  }

  // Takes a device out of the family (a lost phone): its token opens nothing
  // from now on. Never the device asking, so a family always keeps one.
  async removeDevice(secret: string, deviceId: unknown): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    const self = isJar(storage) ? this.seen(hash) : null;
    if (self == null) return NOT_A_DEVICE;
    return outcome(() => {
      const target = id(deviceId, 'deviceId');
      if (target === self) throw new JarError(409, "That's this device: remove it from another one");
      if (!first(storage, 'SELECT 1 FROM devices WHERE id = ?', target)) {
        throw new JarError(404, 'No such device');
      }
      run(storage, 'DELETE FROM devices WHERE id = ?', target);
      return null;
    });
  }

  // The id of the family's device with this hash, or null, checking every one
  // in constant time so the reply's timing gives nothing away.
  private seen(hash: string): number | null {
    const devices = all<{ id: number; secret_hash: string; last_seen_at: number }>(
      this.ctx.storage,
      'SELECT id, secret_hash, last_seen_at FROM devices',
    );
    let match: (typeof devices)[number] | null = null;
    for (const device of devices) {
      if (sameHash(device.secret_hash, hash)) match = device;
    }
    if (!match) return null;
    const now = Date.now();
    if (now - match.last_seen_at >= SEEN_EVERY_MS) {
      run(this.ctx.storage, 'UPDATE devices SET last_seen_at = ? WHERE id = ?', now, match.id);
    }
    return match.id;
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
