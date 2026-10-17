import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { fromSomewhere } from './caller';

import type { CreateFamilyReply, Icon, JarApi, JarFn, JarImport, PhotoUpload } from '../src/jar/api';
import { MAX_JAR_BYTES, MAX_JAR_PHOTO_BYTES } from '../src/jar/limits';
import { FORGOTTEN_AFTER_MS } from '../src/jar/photos';
import { JAR_VERSION, jarVersion, migrateJar } from '../src/jar/schema';

const BASE = 'https://relay.example';
const APP = 'https://wish-jar.expo.app';
const NO_ICON: Icon = { emoji: null, photoUri: null };
const ID = '[A-Za-z0-9_-]{43}';

function relay(path: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(path.startsWith('http') ? path : `${BASE}${path}`, init)));
}

// A few bytes that start like a JPEG, different every time.
function jpeg(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes.subarray(0, Math.min(size, 65536)));
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

function dataUri(bytes: Uint8Array, type = 'image/jpeg'): string {
  return `data:${type};base64,${btoa(String.fromCharCode(...bytes))}`;
}

async function newFamily(body: unknown = {}): Promise<CreateFamilyReply> {
  const response = await relay('/families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json();
}

function jar(token: string) {
  return async <F extends JarFn>(fn: F, ...args: JarApi[F]['args']): Promise<JarApi[F]['result']> => {
    const response = await relay('/jar/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fn, args }),
    });
    expect(response.status, `${fn}: ${await response.clone().text()}`).toBe(200);
    return ((await response.json()) as { result: JarApi[F]['result'] }).result;
  };
}

async function newJar(body?: unknown) {
  const family = await newFamily(body);
  return { ...family, call: jar(family.token) };
}

function upload(token: string | null, body: BodyInit, headers: Record<string, string> = {}) {
  return relay('/photos', {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body,
  });
}

async function uploaded(token: string, bytes = jpeg()): Promise<string> {
  const response = await upload(token, bytes);
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as PhotoUpload).url;
}

function removePhoto(token: string | null, url: string) {
  return relay(url, {
    method: 'DELETE',
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
  });
}

async function status(url: string): Promise<number> {
  const response = await relay(url);
  await response.arrayBuffer();
  return response.status;
}

function photoCount(familyId: string): Promise<number> {
  return runInDurableObject(env.FAMILY_JARS.getByName(familyId), (_, state) =>
    Number(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM photos').one().count),
  );
}

describe('uploading a photo', () => {
  it('keeps the JPEG in the jar and hands out its URL', async () => {
    const { token, familyId } = await newJar();
    const bytes = jpeg(2048);
    const url = await uploaded(token, bytes);
    expect(url).toMatch(new RegExp(`^${BASE}/photos/${familyId}/${ID}\\.jpg$`));

    const shown = await relay(url);
    expect(shown.status).toBe(200);
    expect(new Uint8Array(await shown.arrayBuffer())).toEqual(bytes);
    expect(shown.headers.get('Content-Type')).toBe('image/jpeg');
    expect(shown.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(shown.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    expect(shown.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await photoCount(familyId)).toBe(1);
  });

  it('gives every photo an id of its own that nobody can guess', async () => {
    const { token } = await newJar();
    const bytes = jpeg();
    const urls = [await uploaded(token, bytes), await uploaded(token, bytes), await uploaded(token, bytes)];
    expect(new Set(urls).size).toBe(3);
    // 32 random bytes each.
    for (const url of urls) expect(url.match(new RegExp(`/(${ID})\\.jpg$`))).not.toBeNull();
  });

  it('only takes photos from a device of the family', async () => {
    const { token } = await newJar();
    expect((await upload(null, jpeg())).status).toBe(401);
    expect((await upload('nonsense', jpeg())).status).toBe(401);
    const [familyId] = token.split('.');
    const wrong = `${familyId}.${'A'.repeat(43)}`;
    expect((await upload(wrong, jpeg())).status).toBe(401);
    const unknown = `${'B'.repeat(43)}.${'A'.repeat(43)}`;
    expect((await upload(unknown, jpeg())).status).toBe(401);
  });

  it('only takes a JPEG, and not a huge one', async () => {
    const { token } = await newJar();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    expect((await upload(token, png)).status).toBe(415);
    expect((await upload(token, jpeg(), { 'Content-Type': 'image/png' })).status).toBe(415);
    expect((await upload(token, jpeg(MAX_JAR_PHOTO_BYTES + 1))).status).toBe(413);
    expect((await upload(token, jpeg(MAX_JAR_PHOTO_BYTES))).status).toBe(201);
  });

  it('turns photos away once the jar is full', async () => {
    const { token, familyId } = await newJar();
    await runInDurableObject(env.FAMILY_JARS.getByName(familyId), (_, state) => {
      state.storage.sql.exec('CREATE TABLE ballast (data BLOB)');
      const rows = Math.ceil(MAX_JAR_BYTES / (1024 * 1024)) + 1;
      for (let row = 0; row < rows; row++) {
        state.storage.sql.exec('INSERT INTO ballast (data) VALUES (randomblob(1024 * 1024))');
      }
    });
    expect((await upload(token, jpeg())).status).toBe(507);
    await runInDurableObject(env.FAMILY_JARS.getByName(familyId), (_, state) => {
      state.storage.sql.exec('DROP TABLE ballast');
    });
    expect((await upload(token, jpeg())).status).toBe(201);
  });

  it("lets Wish Jar's pages upload, and keeps other sites out", async () => {
    const preflight = await relay('/photos', {
      method: 'OPTIONS',
      headers: { Origin: APP, 'Access-Control-Request-Method': 'POST' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST, DELETE');

    const { token } = await newJar();
    const allowed = await upload(token, jpeg(), { Origin: APP });
    expect(allowed.status).toBe(201);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect((await upload(token, jpeg(), { Origin: 'https://evil.example' })).status).toBe(403);
  });
});

describe('showing a photo', () => {
  it('answers 404 for a photo that is not there', async () => {
    const { token, familyId } = await newJar();
    const url = await uploaded(token);
    const other = await newJar();
    const photoId = url.match(new RegExp(`/(${ID})\\.jpg$`))![1];

    expect(await status(`/photos/${familyId}/${'C'.repeat(43)}.jpg`)).toBe(404);
    // The right photo id under another family's id.
    expect(await status(`/photos/${other.familyId}/${photoId}.jpg`)).toBe(404);
    expect(await status(`/photos/${'D'.repeat(43)}/${photoId}.jpg`)).toBe(404);
    expect(await status(`/photos/${familyId}/${photoId}`)).toBe(404);
    expect(await status(`/photos/${familyId}/short.jpg`)).toBe(404);
  });

  it('needs no token and no allowed origin', async () => {
    const { token } = await newJar();
    const url = await uploaded(token);
    const response = await relay(url, { headers: { Origin: 'https://anywhere.example' } });
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  });
});

describe('deleting a photo', () => {
  it("drops an upload the device didn't save", async () => {
    const { token } = await newJar();
    const url = await uploaded(token);
    expect(await status(url)).toBe(200);
    expect((await removePhoto(token, url)).status).toBe(204);
    expect(await status(url)).toBe(404);
    expect((await removePhoto(token, url)).status).toBe(404);
  });

  it('keeps a photo something still shows', async () => {
    const { token, call } = await newJar();
    const url = await uploaded(token);
    await call('insertKid', { name: 'Ava', photoUri: url });
    expect((await removePhoto(token, url)).status).toBe(409);
    expect(await status(url)).toBe(200);
  });

  it("is only for the photo's own family", async () => {
    const { token } = await newJar();
    const url = await uploaded(token);
    const other = await newJar();
    expect((await removePhoto(null, url)).status).toBe(401);
    expect((await removePhoto(other.token, url)).status).toBe(404);
    expect(await status(url)).toBe(200);
  });
});

describe('photos nothing shows any more', () => {
  it('go when a save replaces them', async () => {
    const { token, call } = await newJar();
    const first = await uploaded(token);
    const kidId = await call('insertKid', { name: 'Ava', photoUri: first });
    expect(await status(first)).toBe(200);

    const second = await uploaded(token);
    expect(await call('updateKid', kidId, { name: 'Ava', photoUri: second })).toBe(first);
    expect(await status(first)).toBe(404);
    expect(await status(second)).toBe(200);

    expect(await call('setKidPhoto', kidId, null)).toBe(second);
    expect(await status(second)).toBe(404);
  });

  it('stay while something else shows them', async () => {
    const { token, call } = await newJar();
    const shared = await uploaded(token);
    const taskId = await call('insertTask', {
      name: 'Make bed',
      period: 'morning',
      coinAmount: 1,
      icon: { emoji: null, photoUri: shared },
    });
    const typeId = await call('insertConsequenceType', {
      name: 'Say sorry',
      coinAmount: 0,
      icon: { emoji: null, photoUri: shared },
    });
    await call('deleteTask', taskId);
    expect(await status(shared)).toBe(200);
    await call('updateConsequenceType', typeId, { name: 'Say sorry', coinAmount: 0, icon: { emoji: '🙏', photoUri: null } });
    expect(await status(shared)).toBe(404);
  });

  it("go with a deleted kid, theirs and their wishes'", async () => {
    const { token, familyId, call } = await newJar();
    const kidPhoto = await uploaded(token);
    const wishPhoto = await uploaded(token);
    const otherWish = await uploaded(token);
    const kidId = await call('insertKid', { name: 'Ava', photoUri: kidPhoto });
    const otherKid = await call('insertKid', { name: 'Ben', photoUri: null });
    await call('insertWish', { kidId, name: 'Bike', coinAmount: 10, icon: { emoji: null, photoUri: wishPhoto } });
    const wishId = await call('insertWish', {
      kidId: otherKid,
      name: 'Kite',
      coinAmount: 5,
      icon: { emoji: null, photoUri: otherWish },
    });

    expect((await call('deleteKid', kidId)).sort()).toEqual([kidPhoto, wishPhoto].sort());
    expect(await status(kidPhoto)).toBe(404);
    expect(await status(wishPhoto)).toBe(404);
    expect(await status(otherWish)).toBe(200);

    await call('deleteWish', wishId);
    expect(await status(otherWish)).toBe(404);
    expect(await photoCount(familyId)).toBe(0);
  });

  it('are swept up a day after an upload nothing came to show', async () => {
    const { token, familyId, call } = await newJar();
    const forgotten = await uploaded(token);
    const kept = await uploaded(token);
    await call('insertKid', { name: 'Ava', photoUri: kept });
    await runInDurableObject(env.FAMILY_JARS.getByName(familyId), (_, state) => {
      state.storage.sql.exec('UPDATE photos SET created_at = ?', Date.now() - FORGOTTEN_AFTER_MS - 1000);
    });
    const fresh = await uploaded(token);
    expect(await status(forgotten)).toBe(404);
    expect(await status(kept)).toBe(200);
    expect(await status(fresh)).toBe(200);
  });
});

describe('photos from before the jar kept them', () => {
  it("moves a device's data: URIs into the jar when it uploads its jar", async () => {
    const bytes = jpeg(500);
    const photo = dataUri(bytes);
    const png = dataUri(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]), 'image/png');
    const jarImport: JarImport = {
      kids: [{ id: 1, name: 'Ava', photo_uri: photo, created_at: 1 }],
      tasks: [
        { id: 1, name: 'Make bed', period: 'morning', coin_amount: 1, icon_emoji: null, icon_photo_uri: photo, created_at: 1 },
        { id: 2, name: 'Brekky', period: 'morning', coin_amount: 1, icon_emoji: null, icon_photo_uri: png, created_at: 2 },
        { id: 3, name: 'Shower', period: 'evening', coin_amount: 1, icon_emoji: null, icon_photo_uri: 'file:///phone/a.jpg', created_at: 3 },
        { id: 4, name: 'Bad', period: 'evening', coin_amount: 1, icon_emoji: null, icon_photo_uri: 'data:image/jpeg;base64,AAAA', created_at: 4 },
      ],
    };
    const { familyId, call } = await newJar({ jar: jarImport });

    const [kid] = await call('listKids');
    const tasks = await call('listTasks');
    expect(kid.photoUri).toMatch(new RegExp(`^${BASE}/photos/${familyId}/${ID}\\.jpg$`));
    // The same picture twice is one photo.
    expect(tasks[0].icon.photoUri).toBe(kid.photoUri);
    expect(tasks[1].icon.photoUri).toMatch(/\.jpg$/);
    expect(tasks[2].icon.photoUri).toBe('file:///phone/a.jpg');
    // Not a JPEG after all: left as it was.
    expect(tasks[3].icon.photoUri).toBe('data:image/jpeg;base64,AAAA');
    expect(await photoCount(familyId)).toBe(2);

    const shown = await relay(kid.photoUri!);
    expect(new Uint8Array(await shown.arrayBuffer())).toEqual(bytes);
    const shownPng = await relay(tasks[1].icon.photoUri!);
    expect(shownPng.headers.get('Content-Type')).toBe('image/png');
    await shownPng.arrayBuffer();
  });

  it('moves the data: URIs of a jar made before photos, at its next call', async () => {
    const { familyId, call } = await newJar();
    const photo = dataUri(jpeg());
    await call('insertKid', { name: 'Ava', photoUri: null });
    await runInDurableObject(env.FAMILY_JARS.getByName(familyId), (_, state) => {
      const storage = state.storage;
      // Back to version 2, as a jar made before this change is, with a web
      // photo in it.
      storage.sql.exec('DROP TABLE photos');
      storage.sql.exec("DELETE FROM jar_meta WHERE key = 'photos_moved'");
      storage.sql.exec("UPDATE jar_meta SET value = '2' WHERE key = 'version'");
      storage.sql.exec('UPDATE kids SET photo_uri = ?', photo);
      migrateJar(storage);
      expect(jarVersion(storage)).toBe(JAR_VERSION);
    });
    // A fresh object, as after a deploy, finds the photos still to move.
    await runInDurableObject(env.FAMILY_JARS.getByName(familyId), (instance) => {
      (instance as unknown as { photosMoved: boolean }).photosMoved = false;
    });
    const [kid] = await call('listKids');
    expect(kid.photoUri).toMatch(new RegExp(`^${BASE}/photos/${familyId}/${ID}\\.jpg$`));
    expect(await status(kid.photoUri!)).toBe(200);
  });

  it('turns a data: URI a device still sends into a photo of its own', async () => {
    const { familyId, call } = await newJar();
    const kidId = await call('insertKid', { name: 'Ava', photoUri: dataUri(jpeg()) });
    const kid = await call('getKid', kidId);
    expect(kid?.photoUri).toMatch(new RegExp(`^${BASE}/photos/${familyId}/${ID}\\.jpg$`));
  });

  it("swaps a phone's own file for the photo it uploaded", async () => {
    const { token, call } = await newJar();
    const file = 'file:///data/user/0/wish-jar/files/photos/1.jpg';
    const kidId = await call('insertKid', { name: 'Ava', photoUri: file });
    await call('insertWish', { kidId, name: 'Bike', coinAmount: 3, icon: { emoji: null, photoUri: file } });
    await call('insertTask', { name: 'Make bed', period: 'morning', coinAmount: 1, icon: NO_ICON });

    const url = await uploaded(token);
    expect(await call('replacePhoto', file, url)).toBe(2);
    expect((await call('getKid', kidId))?.photoUri).toBe(url);
    expect((await call('listWishes'))[0].icon.photoUri).toBe(url);
    // Nothing shows it any more: the device drops its upload.
    expect(await call('replacePhoto', file, url)).toBe(0);
  });

  it('drops the jar photo a replace leaves behind', async () => {
    const { token, call } = await newJar();
    const before = await uploaded(token);
    const after = await uploaded(token);
    await call('insertKid', { name: 'Ava', photoUri: before });
    expect(await call('replacePhoto', before, after)).toBe(1);
    expect(await status(before)).toBe(404);
  });
});
