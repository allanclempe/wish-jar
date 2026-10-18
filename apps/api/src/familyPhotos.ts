import { purgeUrls } from './cachePurge';
import { takeLimit, waitHeaders } from './CallerLimits';
import { parseDeviceToken, refuse } from './families';
import type { JarOutcome } from './FamilyJar';
import { readCapped, type Reply } from './http';
import type { PhotoUpload } from '@wish-jar/jar';
import { MAX_JAR_PHOTO_BYTES } from './jar/limits';
import { isJpeg, PHOTO_ID, PHOTO_SIGNATURE } from './jar/photos';
import { API_HOST, SITE_HOST } from './routes';
import { photoSignatureOk, unsignedAllowed } from './signing';

// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// The family's photos (WJ-49); packages/jar/src/api.ts lists the endpoints. Uploading
// and deleting need a device of the family; showing one needs only its URL,
// as an <img> or <Image> can't send a token. The URL's signature (WJ-55) is
// checked before anything else, so a made-up one wakes no jar.

// A day in the device's own cache, and in no shared one (WJ-59). A photo's URL
// always means the same JPEG, but a deleted photo should stop being shown:
// the edge forgets it at once (forgetPhotos), and a device that loaded it
// within a day at most. Each load after that is a request toward the Free
// plan's 100,000 a day, answered from the edge copy without waking the jar,
// so a frame showing 50 photos costs 50 requests a day, not 1,200 as with an
// hour.
const PHOTO_CACHE_CONTROL = 'private, max-age=86400';
// The copy kept at Cloudflare's edge (the Cache API, at the addresses in
// PHOTO_ORIGINS), so the family's devices loading the same photos don't each
// wake the jar. A day too: a deleted photo is purged everywhere (src/cachePurge.ts),
// but only in the data centre that deleted it while the purge token isn't
// set.
const EDGE_CACHE_CONTROL = 'public, max-age=86400';
// A photo the jar doesn't have is remembered at the edge for a minute, so
// asking again for it doesn't wake the jar every time. No new photo can show
// up at that URL meanwhile: its id is new and random.
const MISSING_CACHE_CONTROL = 'public, max-age=60';

// Every address that serves a family's photos (workers.dev serves none since
// WJ-58), so every one the edge cache may keep them under: the API's custom
// domain, and the site's, which passes the API's paths on to it unchanged
// (site/worker.js, WJ-63) for the photo URLs kept from when the API was
// there. The API sees the site's URL then, so showPhoto keeps those under
// the site's host. A deleted photo is forgotten and purged at both, as are a
// deleted family's (FamilyJar.deleteFamily), which has no request to go by.
export const PHOTO_ORIGINS: readonly string[] = [`https://${API_HOST}`, `https://${SITE_HOST}`];

// Where the family's photos are served from, the start of every photo URL.
export function photoBase(request: Request, familyId: string): string {
  return `${new URL(request.url).origin}/photos/${familyId}/`;
}

// POST /photos: a JPEG from a device of the family, already shrunk to 1024 px
// at most (src/photos/shrink.ts in the app).
export async function uploadPhoto(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  reply: Reply,
): Promise<Response> {
  // Checked before the body is read, like /jar/call.
  const device = parseDeviceToken(request.headers.get('Authorization'), env);
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });
  if (request.headers.get('Content-Type') !== 'image/jpeg') return reply('Send a JPEG', 415);
  const wait = await takeLimit(request, env, 'uploads');
  if (wait != null) return reply('Too many photos at once: wait a little', 429, waitHeaders(wait));
  const photo = await readCapped(request, MAX_JAR_PHOTO_BYTES);
  if (!photo) return reply('Photo too big', 413);
  if (!isJpeg(new Uint8Array(photo))) return reply('Send a JPEG', 415);

  const jar = env.FAMILY_JARS.getByName(device.familyId);
  const outcome = (await jar.addPhoto(device.secret, photo, photoBase(request, device.familyId))) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  await forgetPhotos(request, env, ctx, device.familyId, outcome.dropped);
  const uploaded: PhotoUpload = { url: outcome.result as string };
  return reply(JSON.stringify(uploaded), 201, { 'Content-Type': 'application/json' });
}

// GET /photos/:familyId/:id.jpg?sig=…, for anyone holding the URL. A URL
// from before WJ-55 has no signature: shown as before until UNSIGNED_UNTIL,
// 404 after. A bad signature is a URL the API never made: 404 too.
export async function showPhoto(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  familyId: string,
  photoId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const signature = url.searchParams.get(PHOTO_SIGNATURE);
  const signed = signature === null ? unsignedAllowed() : photoSignatureOk(env, familyId, photoId, signature);
  if (!signed) return missingPhoto();

  // Kept by its path only, so the same photo is one copy whatever the query,
  // and a made-up query can't get past the cache to the jar.
  const key = `${url.origin}${url.pathname}`;
  const cache = caches.default;
  const cached = await cache.match(key);
  if (cached?.status === 404) return missingPhoto();
  if (cached) return photoResponse(cached.body, cached.headers.get('Content-Type') ?? 'image/jpeg');

  const photo = await env.FAMILY_JARS.getByName(familyId).photo(photoId);
  if (!photo) {
    const edgeMissing = new Response(null, { status: 404, headers: { 'Cache-Control': MISSING_CACHE_CONTROL } });
    ctx.waitUntil(cache.put(key, edgeMissing));
    return missingPhoto();
  }
  const edgeCopy = new Response(photo.data, {
    headers: { 'Content-Type': photo.type, 'Cache-Control': EDGE_CACHE_CONTROL },
  });
  ctx.waitUntil(cache.put(key, edgeCopy));
  return photoResponse(photo.data, photo.type);
}

// DELETE /photos/:familyId/:id.jpg: an upload the device didn't save after
// all. Only a device of the photo's own family.
export async function deletePhoto(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  reply: Reply,
  familyId: string,
  photoId: string,
): Promise<Response> {
  const device = parseDeviceToken(request.headers.get('Authorization'), env);
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });
  if (device.familyId !== familyId) return reply('No such photo', 404);
  const jar = env.FAMILY_JARS.getByName(familyId);
  const outcome = (await jar.deletePhoto(device.secret, photoId)) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  await forgetPhotos(request, env, ctx, familyId, outcome.dropped);
  return reply(null, 204);
}

// The family id and photo id in a photo's path, or null.
export function parsePhotoPath(pathname: string): { familyId: string; photoId: string } | null {
  const match = pathname.match(/^\/photos\/([^/]+)\/([^/]+)\.jpg$/);
  if (!match || !PHOTO_ID.test(match[1]) || !PHOTO_ID.test(match[2])) return null;
  return { familyId: match[1], photoId: match[2] };
}

// Photos the jar deleted, dropped from this data centre's edge cache (kept by
// path, without the signature) so their URLs answer 404 here at once, and
// purged from every other one after the reply (src/cachePurge.ts): at the
// address the request came to and at every one in PHOTO_ORIGINS, as a photo's
// URL may start with either.
export async function forgetPhotos(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  familyId: string,
  photoIds: string[] = [],
): Promise<void> {
  const urls = photoKeys(familyId, photoIds, new URL(request.url).origin);
  if (urls.length === 0) return;
  ctx.waitUntil(purgeUrls(env, urls));
  await Promise.all(urls.map((url) => caches.default.delete(url)));
}

// What the edge cache keeps the photos under: their URLs without the
// signature, at every address in PHOTO_ORIGINS and at `origin` too.
export function photoKeys(familyId: string, photoIds: readonly string[], origin?: string): string[] {
  const origins = new Set([...(origin ? [origin] : []), ...PHOTO_ORIGINS]);
  return [...origins].flatMap((at) => photoIds.map((id) => `${at}/photos/${familyId}/${id}.jpg`));
}

function missingPhoto(): Response {
  return new Response('No such photo', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
}

function photoResponse(body: BodyInit | null, type: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': PHOTO_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
      // Shown on Wish Jar's pages, which are cross-origin isolated, and on
      // any page of the family's devices.
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
