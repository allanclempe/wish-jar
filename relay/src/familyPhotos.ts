import { takeLimit, waitHeaders } from './CallerLimits';
import { parseDeviceToken, refuse } from './families';
import type { JarOutcome } from './FamilyJar';
import { readCapped, type Reply } from './http';
import type { PhotoUpload } from './jar/api';
import { MAX_JAR_PHOTO_BYTES } from './jar/limits';
import { isJpeg, PHOTO_ID } from './jar/photos';

// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// The family's photos (WJ-49); src/jar/api.ts lists the endpoints. Uploading
// and deleting need a device of the family; showing one needs only its URL,
// as an <img> or <Image> can't send a token.

// A year, and never fetched again: a photo's URL always means the same JPEG.
const PHOTO_CACHE_CONTROL = 'public, max-age=31536000, immutable';
// The copy kept at Cloudflare's edge (the Cache API, on the custom domain
// only), so the family's devices loading the same photos don't each wake the
// jar. Shorter, as a deleted photo is only forgotten in the data centre that
// deleted it.
const EDGE_CACHE_CONTROL = 'public, max-age=86400';

// Where the family's photos are served from, the start of every photo URL.
export function photoBase(request: Request, familyId: string): string {
  return `${new URL(request.url).origin}/photos/${familyId}/`;
}

// POST /photos: a JPEG from a device of the family, already shrunk to 1024 px
// at most (src/photos/shrink.ts in the app).
export async function uploadPhoto(request: Request, env: Env, reply: Reply): Promise<Response> {
  // Checked before the body is read, like /jar/call.
  const device = parseDeviceToken(request.headers.get('Authorization'));
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
  await forgetPhotos(request, device.familyId, outcome.dropped);
  const uploaded: PhotoUpload = { url: outcome.result as string };
  return reply(JSON.stringify(uploaded), 201, { 'Content-Type': 'application/json' });
}

// GET /photos/:familyId/:id.jpg, for anyone holding the URL.
export async function showPhoto(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  familyId: string,
  photoId: string,
): Promise<Response> {
  const cache = caches.default;
  const cached = await cache.match(request.url);
  if (cached) return photoResponse(cached.body, cached.headers.get('Content-Type') ?? 'image/jpeg');

  const photo = await env.FAMILY_JARS.getByName(familyId).photo(photoId);
  if (!photo) {
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
  const edgeCopy = new Response(photo.data, {
    headers: { 'Content-Type': photo.type, 'Cache-Control': EDGE_CACHE_CONTROL },
  });
  ctx.waitUntil(cache.put(request.url, edgeCopy));
  return photoResponse(photo.data, photo.type);
}

// DELETE /photos/:familyId/:id.jpg: an upload the device didn't save after
// all. Only a device of the photo's own family.
export async function deletePhoto(
  request: Request,
  env: Env,
  reply: Reply,
  familyId: string,
  photoId: string,
): Promise<Response> {
  const device = parseDeviceToken(request.headers.get('Authorization'));
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });
  if (device.familyId !== familyId) return reply('No such photo', 404);
  const jar = env.FAMILY_JARS.getByName(familyId);
  const outcome = (await jar.deletePhoto(device.secret, photoId)) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  await forgetPhotos(request, familyId, outcome.dropped);
  return reply(null, 204);
}

// The family id and photo id in a photo's path, or null.
export function parsePhotoPath(pathname: string): { familyId: string; photoId: string } | null {
  const match = pathname.match(/^\/photos\/([^/]+)\/([^/]+)\.jpg$/);
  if (!match || !PHOTO_ID.test(match[1]) || !PHOTO_ID.test(match[2])) return null;
  return { familyId: match[1], photoId: match[2] };
}

// Photos the jar deleted, dropped from this data centre's edge cache so their
// URLs answer 404 here at once.
export async function forgetPhotos(request: Request, familyId: string, photoIds: string[] = []): Promise<void> {
  const base = photoBase(request, familyId);
  await Promise.all(photoIds.map((id) => caches.default.delete(`${base}${id}.jpg`)));
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
