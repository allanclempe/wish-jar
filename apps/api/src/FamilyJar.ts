import { DurableObject } from 'cloudflare:workers';

import { purgeUrls } from './cachePurge';
import type { Device, JarChange, JarTable } from '@wish-jar/jar';
import { ActiveDay } from './jar/activeDay';
import { findCall } from './jar/calls';
import { DailyWrites } from './jar/dailyWrites';
import { importJar } from './jar/importJar';
import { MAX_JAR_BYTES } from './jar/limits';
import {
  addPhoto,
  deletePhoto,
  dropPhotos,
  moveDataPhotos,
  PHOTO_TABLES,
  photoUrl,
  type PhotoUrls,
  readPhoto,
  signPhotoUrls,
  type StoredPhoto,
  sweepPhotos,
} from './jar/photos';
import { isJar, migrateJar, STARTER_CONSEQUENCE_TYPES } from './jar/schema';
import { all, countingWrites, first, insert, run } from './jar/sql';
import { id, JarError, type JarErrorStatus, label, record } from './jar/validate';
import { clientId } from './families';
import { photoKeys } from './familyPhotos';
import { LIVE_REFUSED, liveResponse, liveToken, PING, PONG, refusedSocket } from './live';
import { photoSignature } from './signing';
import { countUsage } from './usage';

// What the Worker gets back: the result, or the status and why. `dropped` are
// the photos the call deleted, for the Worker to forget too (src/familyPhotos.ts).
// `wait` is how many seconds a 429 asks to wait.
export type JarOutcome =
  | { ok: true; result: unknown; dropped?: string[] }
  | { ok: false; status: JarErrorStatus; error: string; wait?: number };

const NOT_A_DEVICE: JarOutcome = { ok: false, status: 401, error: 'Not a device of this family' };

// Past the family's daily budget (src/jar/dailyWrites.ts).
const TOO_MANY_WRITES = 'Too many changes today: the jar takes more at 00:00 UTC';

// A family's jar holds MAX_JAR_BYTES at most.
const JAR_FULL = 'The jar is full: delete something first';
const JAR_TOO_BIG = 'That jar is too big to bring online: delete some photos first';

// A device's last_seen_at is only written this often, so a device that reads
// the jar all day doesn't spend the Free plan's daily writes on it.
const SEEN_EVERY_MS = 10 * 60_000;

// A family deletes itself (alarm) when no device has been seen in it for
// ABANDONED_MS, or when none came back to it in the UNUSED_MS after it was
// made: a family made by a script and left, or a setup tried and given up
// on. "Came back" is a device seen at least SEEN_EVERY_MS after the family
// was made, as last_seen_at isn't written more often. A family with a socket
// open is alive whatever last_seen_at says, as a device listening without
// calling doesn't write it; it's looked at again a day later.
export const ABANDONED_MS = 183 * 24 * 60 * 60_000;
export const UNUSED_MS = 7 * 24 * 60 * 60_000;
const RECHECK_MS = 24 * 60 * 60_000;

// Set in jar_meta once the photos kept as data: URIs are in the photos table.
const PHOTOS_MOVED = 'photos_moved';
// Set in jar_meta once the photo URLs from before WJ-55 have their signature.
const PHOTOS_SIGNED = 'photos_signed';

// What each device's socket (WJ-50) keeps through hibernation: whose it is,
// and the app it's from, which a change it made isn't sent back to.
type LiveSocket = { device: number; client: string | null };

function deviceTag(deviceId: number): string {
  return `device:${deviceId}`;
}

// One per family, named by its id: the family's whole jar in its own SQLite.
// A Durable Object runs one call at a time and its SQL runs synchronously, so
// writes from all of a family's devices land one after another.
//
// `photoBase` is where the Worker serves this family's photos from
// (`${origin}/photos/${familyId}/`), the start of every photo URL the jar
// hands out. The jar signs each one (WJ-55, src/signing.ts).
//
// create, addDevice and rejoinEchoShow, which give a device its secret, and
// check answer with the device's id, which the Worker signs its token with.
//
// Its writes, removes and photo uploads count toward a daily budget (WJ-56,
// src/jar/dailyWrites.ts), counted here as the jar is awake for them anyway.
// The first device it sees on a day counts the family as active that day
// (WJ-82, src/usage.ts), with nothing that says which family.
//
// The family's devices keep a WebSocket open to it (WJ-50), through the
// Hibernation API: an idle socket costs no duration, the pings the app sends
// are answered without waking the jar, and nothing about a socket is written
// to storage. After a call that changed the jar, every other socket hears
// which tables changed.
export class FamilyJar extends DurableObject<Env> {
  // Whether the photos kept as data: URIs have moved (movePhotosOnce), and
  // the URLs from before WJ-55 are signed (signPhotosOnce).
  private photosMoved = false;
  private photosSigned = false;
  private writes = new DailyWrites(this.ctx.storage);
  private active = new ActiveDay(this.ctx.storage);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Before any call, so every call sees the current tables.
    if (isJar(ctx.storage)) {
      migrateJar(ctx.storage);
      // Families from before WJ-51 have no cleanup alarm yet: it's set for
      // when the family is next due, not run straight away, so it's there
      // as soon as the jar answers.
      void ctx.blockConcurrencyWhile(async () => {
        if ((await ctx.storage.getAlarm()) != null) return;
        const now = Date.now();
        await ctx.storage.setAlarm(this.cleanupDue(now) ?? now);
      });
    }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  // The family's cleanup (see ABANDONED_MS): deletes it when it's due, or
  // looks again when it next could be.
  async alarm(): Promise<void> {
    const storage = this.ctx.storage;
    if (!isJar(storage)) return;
    const next = this.cleanupDue(Date.now());
    if (next == null) {
      await this.deleteFamily();
      countUsage(this.env, 'family_expired');
    } else await storage.setAlarm(next);
  }

  // GET /jar/live, from the Worker (src/live.ts): a socket for a device of the
  // family, tagged with the device so removing it can close it.
  async fetch(request: Request): Promise<Response> {
    const token = liveToken(request, this.env);
    const self = token && isJar(this.ctx.storage) ? this.seen(await hashSecret(token.secret)) : null;
    if (self == null) return refusedSocket();
    const [socket, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [deviceTag(self)]);
    const client = clientId(new URL(request.url).searchParams.get('client'));
    server.serializeAttachment({ device: self, client } satisfies LiveSocket);
    return liveResponse(socket);
  }

  // Devices only listen; "ping" is answered without coming here.
  async webSocketMessage(): Promise<void> {}

  // Sets up a new family with its first device, from an existing jar when
  // `request.jar` is given (see CreateFamilyRequest).
  async create(secret: string, request: unknown, photoBase: string): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    if (isJar(storage)) return { ok: false, status: 409, error: 'Family already exists' };
    const created = outcome(() =>
      storage.transactionSync(() => {
        const body = record(request, 'body');
        const device = label(body.label);
        migrateJar(storage);
        if (body.jar === undefined) storage.sql.exec(STARTER_CONSEQUENCE_TYPES);
        else importJar(storage, body.jar);
        moveDataPhotos(storage, this.photoUrls(photoBase));
        // Rolled back, so nothing is kept: a family starts no bigger than a
        // jar may grow (WJ-57).
        if (storage.sql.databaseSize > MAX_JAR_BYTES) throw new JarError(507, JAR_TOO_BIG);
        run(storage, "INSERT INTO jar_meta (key, value) VALUES (?, '1'), (?, '1')", PHOTOS_MOVED, PHOTOS_SIGNED);
        return insert(storage, 'INSERT INTO devices (secret_hash, label) VALUES (?, ?)', hash, device);
      }),
    );
    if (created.ok) await storage.setAlarm(Date.now() + UNUSED_MS);
    return created;
  }

  // Runs one allowlisted function for a device holding `secret`. A photo the
  // call leaves with nothing showing it is deleted with it, and a data: URI
  // it brings becomes a photo of the jar's own.
  // `client` is the app making the call, which isn't told of its own change.
  async call(
    secret: string,
    fn: unknown,
    args: unknown,
    photoBase: string,
    client: string | null = null,
  ): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    if (!isJar(storage) || this.seen(hash) == null) return NOT_A_DEVICE;
    this.movePhotosOnce(photoBase);
    this.signPhotosOnce();
    let dropped: string[] = [];
    let changes: readonly JarTable[] = [];
    const now = Date.now();
    const counted = countingWrites(storage);
    // Whether it's a write or a remove, and the bytes of the photos it
    // brings as data: URIs, for the family's budget.
    let writing = false;
    let photoBytes = 0;
    const done = outcome(() => {
      const found = findCall(fn, args);
      if (found.call.kind !== 'read') {
        const wait = this.writes.wait(now);
        if (wait != null) throw new JarError(429, TOO_MANY_WRITES, wait);
        writing = true;
        const sent = JSON.stringify(found.args);
        if (sent.includes('"data:')) photoBytes = sent.length;
      }
      if (found.call.kind === 'write' && storage.sql.databaseSize >= MAX_JAR_BYTES) {
        throw new JarError(507, JAR_FULL);
      }
      return storage.transactionSync(() => {
        const result = found.call.run(counted.db, found.args);
        if (found.call.leftBehind) dropped = dropPhotos(counted.db, found.call.leftBehind(found.args, result));
        if (photoBytes > 0) moveDataPhotos(counted.db, this.photoUrls(photoBase));
        if (found.call.changes && (found.call.changed?.(result) ?? true)) changes = found.call.changes;
        return result;
      });
    });
    // A write that failed halfway still counts what it wrote.
    if (writing) this.writes.add(now, counted.written(), photoBytes);
    if (done.ok) this.tell(changes, client);
    return done.ok && dropped.length > 0 ? { ...done, dropped } : done;
  }

  // Keeps an uploaded JPEG (already checked by the Worker) for a device of
  // the family; its URL. Uploads nothing came to show are tidied up here too.
  async addPhoto(secret: string, data: ArrayBuffer, photoBase: string): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    if (!isJar(storage) || this.seen(hash) == null) return NOT_A_DEVICE;
    const now = Date.now();
    const wait = this.writes.wait(now);
    if (wait != null) return { ok: false, status: 429, error: TOO_MANY_WRITES, wait };
    const counted = countingWrites(storage);
    const dropped = sweepPhotos(counted.db, now);
    if (storage.sql.databaseSize + data.byteLength >= MAX_JAR_BYTES) {
      this.writes.add(now, counted.written(), 0);
      return { ok: false, status: 507, error: JAR_FULL };
    }
    const url = this.photoUrls(photoBase)(addPhoto(counted.db, new Uint8Array(data)));
    this.writes.add(now, counted.written(), data.byteLength);
    return { ok: true, result: url, dropped };
  }

  // The photo, for anyone holding its URL: the id is the secret.
  async photo(photoId: string): Promise<StoredPhoto | null> {
    if (!isJar(this.ctx.storage)) return null;
    return readPhoto(this.ctx.storage, photoId);
  }

  // An upload a device of the family didn't save after all. A photo that
  // something shows stays (409).
  async deletePhoto(secret: string, photoId: string): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    if (!isJar(storage) || this.seen(hash) == null) return NOT_A_DEVICE;
    const result = deletePhoto(storage, photoId);
    if (result === 'gone') return { ok: false, status: 404, error: 'No such photo' };
    if (result === 'in use') return { ok: false, status: 409, error: 'Something still shows that photo' };
    return { ok: true, result: null, dropped: [photoId] };
  }

  // Whether `secret` is one of the family's devices, before the Worker hands
  // out a join code for it or signs its token; the device's id.
  async check(secret: string): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const self = isJar(this.ctx.storage) ? this.seen(hash) : null;
    if (self == null) return NOT_A_DEVICE;
    return { ok: true, result: self };
  }

  // A new device, joining with a code the Worker has already claimed for this
  // family (WJ-48). 410 when the family is gone meanwhile.
  async addDevice(secret: string, deviceLabel: unknown): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    const storage = this.ctx.storage;
    if (!isJar(storage)) return { ok: false, status: 410, error: 'That family jar is gone' };
    const done = outcome(() =>
      insert(storage, 'INSERT INTO devices (secret_hash, label) VALUES (?, ?)', hash, label(deviceLabel)),
    );
    if (done.ok) this.tell(['devices']);
    return done;
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

  // Undoes linkEchoShow when the Show turned out to be in another family
  // (echoShow.ts): no row here has it.
  async unmarkEchoShow(echoShowHash: string): Promise<void> {
    const storage = this.ctx.storage;
    if (!isJar(storage)) return;
    run(storage, 'UPDATE devices SET echo_show_hash = NULL WHERE echo_show_hash = ?', echoShowHash);
  }

  // Whether a device row here is the Echo Show whose Alexa device id hashes to
  // `echoShowHash`, for a link from another family (echoShow.ts, WJ-60).
  async hasEchoShow(echoShowHash: string): Promise<boolean> {
    const storage = this.ctx.storage;
    if (!isJar(storage)) return false;
    return first(storage, 'SELECT id FROM devices WHERE echo_show_hash = ?', echoShowHash) != null;
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
    // Last session's token opens nothing now, its socket included.
    this.closeSockets(row.id);
    return { ok: true, result: row.id };
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
    const removed = outcome(() => {
      const target = id(deviceId, 'deviceId');
      if (target === self) throw new JarError(409, "That's this device: remove it from another one");
      if (!first(storage, 'SELECT 1 FROM devices WHERE id = ?', target)) {
        throw new JarError(404, 'No such device');
      }
      run(storage, 'DELETE FROM devices WHERE id = ?', target);
      this.closeSockets(target);
      return null;
    });
    if (removed.ok) this.tell(['devices']);
    return removed;
  }

  // A parent deleting the whole family from one of its devices (WJ-76): the
  // same as the cleanup of an abandoned one, straight away.
  async deleteByDevice(secret: string): Promise<JarOutcome> {
    const hash = await hashSecret(secret);
    if (!isJar(this.ctx.storage) || this.seen(hash) == null) return NOT_A_DEVICE;
    const dropped = await this.deleteFamily();
    return { ok: true, result: null, dropped };
  }

  // A jar from before WJ-49 keeps web photos as data: URIs in its rows; they
  // move into the photos table at its first call since, when the jar knows
  // the URL to give them. A jar a device uploads (WJ-47) moves them as the
  // family is created.
  private movePhotosOnce(photoBase: string): void {
    if (this.photosMoved) return;
    const storage = this.ctx.storage;
    if (!first(storage, 'SELECT 1 FROM jar_meta WHERE key = ?', PHOTOS_MOVED)) {
      const moved = storage.transactionSync(() => {
        run(storage, "INSERT INTO jar_meta (key, value) VALUES (?, '1')", PHOTOS_MOVED);
        return moveDataPhotos(storage, this.photoUrls(photoBase));
      });
      if (moved > 0) this.tell(PHOTO_TABLES);
    }
    this.photosMoved = true;
  }

  // The photo URLs a jar from before WJ-55 keeps have no signature; they get
  // theirs at its first call since, and the family's devices load them again,
  // so they keep showing once unsigned URLs are turned away.
  private signPhotosOnce(): void {
    if (this.photosSigned) return;
    const storage = this.ctx.storage;
    if (!first(storage, 'SELECT 1 FROM jar_meta WHERE key = ?', PHOTOS_SIGNED)) {
      const familyId = this.familyId();
      const signed = storage.transactionSync(() => {
        run(storage, "INSERT INTO jar_meta (key, value) VALUES (?, '1')", PHOTOS_SIGNED);
        return signPhotoUrls(storage, familyId, (id) => photoSignature(this.env, familyId, id));
      });
      if (signed > 0) this.tell(PHOTO_TABLES);
    }
    this.photosSigned = true;
  }

  // New photos' URLs, signed for this family.
  private photoUrls(photoBase: string): PhotoUrls {
    const familyId = this.familyId();
    return (id) => photoUrl(photoBase, id, photoSignature(this.env, familyId, id));
  }

  // The name the Worker opened the jar by (getByName) is the family id.
  private familyId(): string {
    const familyId = this.ctx.id.name;
    if (!familyId) throw new Error('A family jar is opened by its family id');
    return familyId;
  }

  // Tells every socket but the calling app's own which tables changed. Sent
  // from memory, so a busy day costs the Free plan no storage writes.
  private tell(tables: readonly JarTable[], client: string | null = null): void {
    if (tables.length === 0) return;
    const change: JarChange = { type: 'changed', tables: [...tables] };
    const message = JSON.stringify(change);
    for (const socket of this.ctx.getWebSockets()) {
      const live = socket.deserializeAttachment() as LiveSocket | null;
      if (client && live?.client === client) continue;
      try {
        socket.send(message);
      } catch {
        // Closing already; the app reloads everything when it reconnects.
      }
    }
  }

  // Null when the family is to be deleted now, or when to look again.
  private cleanupDue(now: number): number | null {
    const row = first<{ made: number | null; seen: number | null }>(
      this.ctx.storage,
      'SELECT MIN(created_at) AS made, MAX(last_seen_at) AS seen FROM devices',
    );
    // A family with no device left can't be opened by anyone.
    if (row?.made == null || row.seen == null) return null;
    const cameBack = row.seen >= row.made + SEEN_EVERY_MS;
    const due = cameBack ? row.seen + ABANDONED_MS : row.made + UNUSED_MS;
    if (now < due) return due;
    if (this.ctx.getWebSockets().length > 0) return now + RECHECK_MS;
    return null;
  }

  // Everything of the family's goes: its rows and photos, and its Echo Shows'
  // links. Its devices hear they're out (4401) and their tokens open nothing.
  // Its photos are purged from the edge cache everywhere (src/cachePurge.ts),
  // at every address that serves them (PHOTO_ORIGINS in src/familyPhotos.ts).
  // Join codes run out by themselves within 10 minutes; one used meanwhile
  // finds the family gone (410), as an Echo Show whose link was missed does
  // (404, and its link is dropped then). The ids of the photos it deleted.
  private async deleteFamily(): Promise<string[]> {
    const shows = all<{ echo_show_hash: string }>(
      this.ctx.storage,
      'SELECT echo_show_hash FROM devices WHERE echo_show_hash IS NOT NULL',
    );
    const photos = all<{ id: string }>(this.ctx.storage, 'SELECT id FROM photos').map((photo) => photo.id);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.close(LIVE_REFUSED, 'This family jar is gone');
      } catch {
        // Closed already.
      }
    }
    // The alarm too (compatibility date 2026-02-24 and later).
    await this.ctx.storage.deleteAll();
    this.photosMoved = false;
    this.photosSigned = false;
    this.writes = new DailyWrites(this.ctx.storage);
    this.active = new ActiveDay(this.ctx.storage);
    // The name it was opened by is the family id; only links to this family
    // are dropped, as a Show may have moved on to another.
    const familyId = this.ctx.id.name;
    if (familyId) {
      await Promise.all(
        shows.map((show) => this.env.ECHO_SHOW_LINKS.getByName(show.echo_show_hash).unlink(familyId)),
      );
      await purgeUrls(this.env, photoKeys(familyId, photos));
    }
    return photos;
  }

  // Closes the sockets of a device whose token opens nothing any more.
  private closeSockets(deviceId: number): void {
    for (const socket of this.ctx.getWebSockets(deviceTag(deviceId))) {
      try {
        socket.close(LIVE_REFUSED, 'Not a device of this family');
      } catch {
        // Closed already.
      }
    }
  }

  // The id of the family's device with this hash, or null, checking every one
  // in constant time so the reply's timing gives nothing away. Every device
  // comes through here, so it's where the family counts as active today.
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
    if (this.active.firstToday(now)) countUsage(this.env, 'family_active');
    return match.id;
  }
}

// The function's result, or the refusal it threw. A broken constraint (a wish
// for a kid that isn't there) is the caller's mistake, so it's a 400 too.
function outcome(work: () => unknown): JarOutcome {
  try {
    return { ok: true, result: work() ?? null };
  } catch (error) {
    if (error instanceof JarError) {
      return { ok: false, status: error.status, error: error.message, ...(error.wait ? { wait: error.wait } : {}) };
    }
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
