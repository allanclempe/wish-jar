import { CallerLimits, takeLimit, waitHeaders } from './CallerLimits';
import { CODE_TTL_MS, MAX_PHOTO_BYTES, normaliseCode, randomCode, randomToken } from './codes';
import { devicesApi } from './devices';
import { EchoShowLink } from './EchoShowLink';
import { callJar, createFamily } from './families';
import { deletePhoto, parsePhotoPath, showPhoto, uploadPhoto } from './familyPhotos';
import { FamilyJar } from './FamilyJar';
import { corsReply, readCapped } from './http';
import { JoinAttempts, JoinCode } from './JoinCode';
import { liveApi } from './live';
import { codePage, homePage, htmlResponse } from './pages';
import { PhotoDrop } from './PhotoDrop';
import { qrSvg } from './qr';
import { checkTurnstile, TURNSTILE_HEADER, turnstilePage } from './turnstile';

export { CallerLimits, EchoShowLink, FamilyJar, JoinAttempts, JoinCode, PhotoDrop };

// Wish Jar (the device) asks for a code and collects the photo through /codes,
// with CORS; the phone gets its page, sends the photo and the QR code is drawn
// from this Worker itself, so the phone never opens Wish Jar.
export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/codes' || pathname.startsWith('/codes/')) {
      return api(request, env, url);
    }
    if (pathname === '/families' || pathname === '/jar/call') {
      return familyApi(request, env, pathname);
    }
    // Each device's WebSocket to its family's jar, to hear of changes from
    // the others (WJ-50): src/live.ts.
    if (pathname === '/jar/live') return liveApi(request, env);
    // A family's devices and their join codes (WJ-48), and the Echo Show's
    // way back into its family (WJ-45), for Wish Jar on any device:
    // src/devices.ts.
    if (pathname === '/devices' || pathname.startsWith('/devices/')) {
      const reply = corsReply(request, env);
      if (!reply) return text('Origin not allowed', 403);
      if (method === 'OPTIONS') {
        return reply(null, 204, {
          'Access-Control-Allow-Methods': 'GET, POST, DELETE',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600',
        });
      }
      return devicesApi(request, env, url, reply);
    }
    // The family's photos (WJ-49): src/familyPhotos.ts.
    if (pathname === '/photos' || pathname.startsWith('/photos/')) {
      return photosApi(request, env, ctx, pathname);
    }
    // The Turnstile check for starting a family (WJ-54), for the phone app's
    // WebView: src/turnstile.ts.
    if (method === 'GET' && pathname === '/turnstile') return turnstilePage(url);
    if (method === 'GET' && pathname === '/') return htmlResponse(homePage());
    // The form on / sends the typed code here.
    if (method === 'GET' && pathname === '/s') {
      const code = normaliseCode(url.searchParams.get('code') ?? '');
      return code
        ? Response.redirect(`${url.origin}/s/${code}`, 303)
        : htmlResponse(homePage(true), 400);
    }

    const page = pathname.match(/^\/s\/([^/]+)$/);
    if (method === 'GET' && page) {
      const code = normaliseCode(page[1]);
      const state = code ? await drop(env, code).state() : 'gone';
      return htmlResponse(codePage(code ?? '', state), state === 'gone' ? 410 : 200);
    }

    const upload = pathname.match(/^\/s\/([^/]+)\/photo$/);
    if (method === 'POST' && upload) return receivePhoto(request, env, upload[1]);

    // A photo code opens the relay's page; a join code (WJ-48) opens Wish Jar
    // itself with the code filled in, to join the family from the phone's
    // browser.
    const qr = pathname.match(/^\/qr\/(join\/)?([^/]+)\.svg$/);
    if (method === 'GET' && qr) {
      const code = normaliseCode(qr[2]);
      if (!code) return text('No such code', 404);
      const link = qr[1] ? `${env.APP_URL}/?join=${code}` : `${url.origin}/s/${code}`;
      return new Response(qrSvg(link), {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
          // Shown as an <img> on Wish Jar's (cross-origin isolated) pages.
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }

    return text('Not found', 404);
  },
} satisfies ExportedHandler<Env>;

// The device's side, for Wish Jar's own pages only:
//   POST   /codes              → 201 { code, token, expiresAt, url }, 429
//   GET    /codes/:code/photo  → 200 the JPEG (once), 204 not yet, 403, 410
//   DELETE /codes/:code        → 204, 403, 410
// The token (Authorization: Bearer) is what proves it's the device that asked.
async function api(request: Request, env: Env, url: URL): Promise<Response> {
  const reply = corsReply(request, env);
  if (!reply) return text('Origin not allowed', 403);

  if (request.method === 'OPTIONS') {
    return reply(null, 204, {
      'Access-Control-Allow-Methods': 'GET, POST, DELETE',
      'Access-Control-Allow-Headers': 'Authorization',
      // Polling would otherwise ask again before every collect.
      'Access-Control-Max-Age': '600',
    });
  }

  if (request.method === 'POST' && url.pathname === '/codes') {
    const wait = await takeLimit(request, env, 'photoCodes');
    if (wait != null) return reply('Too many photo codes: wait a little', 429, waitHeaders(wait));
    const token = randomToken();
    const expiresAt = Date.now() + CODE_TTL_MS;
    // A clash is rare (31^6 codes), but a code in use is never handed out twice.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      if (await drop(env, code).open(token, expiresAt)) {
        const body = { code, token, expiresAt, url: `${url.origin}/s/${code}` };
        return reply(JSON.stringify(body), 201, { 'Content-Type': 'application/json' });
      }
    }
    return reply('No free code, try again', 503);
  }

  const match = url.pathname.match(/^\/codes\/([^/]+)(\/photo)?$/);
  const code = match && normaliseCode(match[1]);
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1] ?? '';
  if (match && !code) return reply('Code has run out', 410);

  if (code && match?.[2] && request.method === 'GET') {
    const result = await drop(env, code).collect(token);
    if (result === 'waiting') return reply(null, 204);
    if (result === 'forbidden') return reply('Not your code', 403);
    if (result === 'gone') return reply('Code has run out', 410);
    return reply(result, 200, { 'Content-Type': 'image/jpeg' });
  }
  if (code && !match?.[2] && request.method === 'DELETE') {
    const result = await drop(env, code).close(token);
    if (result === 'forbidden') return reply('Not your code', 403);
    if (result === 'gone') return reply('Code has run out', 410);
    return reply(null, 204);
  }
  return reply('Not found', 404);
}

// The family jar (WJ-46), for Wish Jar on any device:
//   POST /families   { label?, jar? }  → 201 { token, familyId }, 400, 403, 413, 429, 503
//   POST /jar/call   { fn, args }      → 200 { result }, 400, 401, 413, 507
// A device's token (Authorization: Bearer, signed: src/families.ts) opens its
// family's jar; src/jar/api.ts lists the functions and their arguments. A new
// family needs a Turnstile token (WJ-54) in the Turnstile-Token header.
async function familyApi(request: Request, env: Env, pathname: string): Promise<Response> {
  const reply = corsReply(request, env);
  if (!reply) return text('Origin not allowed', 403);

  if (request.method === 'OPTIONS') {
    return reply(null, 204, {
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': `Authorization, Content-Type, ${TURNSTILE_HEADER}`,
      'Access-Control-Max-Age': '600',
    });
  }
  if (request.method !== 'POST') return reply('Use POST', 405, { Allow: 'POST, OPTIONS' });
  if (pathname !== '/families') return callJar(request, env, reply);
  // Before the body is read: a new family may bring a 20 MB jar. And before
  // the caller's limit, so a script without a token doesn't use it up or wake
  // its Durable Object.
  const check = await checkTurnstile(request, env);
  if (check === 'unavailable') return reply("Couldn't check that a person is starting this jar: try again", 503);
  if (check === 'failed') return reply('Starting a family jar needs the Turnstile check', 403);
  const wait = await takeLimit(request, env, 'families');
  if (wait != null) {
    return reply('Too many new family jars from here today: try again tomorrow', 429, waitHeaders(wait));
  }
  return createFamily(request, env, reply);
}

// The family's photos (WJ-49). Showing one needs only its URL, from any page
// (an <img> sends no token); uploading and deleting are for Wish Jar's own
// pages, with CORS like the other device endpoints.
async function photosApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
): Promise<Response> {
  const method = request.method;
  const photo = parsePhotoPath(pathname);
  if ((method === 'GET' || method === 'HEAD') && photo) {
    return showPhoto(request, env, ctx, photo.familyId, photo.photoId);
  }

  const reply = corsReply(request, env);
  if (!reply) return text('Origin not allowed', 403);
  if (method === 'OPTIONS') {
    return reply(null, 204, {
      'Access-Control-Allow-Methods': 'POST, DELETE',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    });
  }
  if (pathname === '/photos') {
    return method === 'POST' ? uploadPhoto(request, env, reply) : reply('Use POST', 405, { Allow: 'POST, OPTIONS' });
  }
  if (!photo) return reply('No such photo', 404);
  if (method !== 'DELETE') return reply('Use GET or DELETE', 405, { Allow: 'GET, DELETE, OPTIONS' });
  return deletePhoto(request, env, reply, photo.familyId, photo.photoId);
}

// The phone's photo, already cropped and shrunk by its page (src/pages.ts).
async function receivePhoto(request: Request, env: Env, rawCode: string): Promise<Response> {
  const code = normaliseCode(rawCode);
  if (!code) return text('Code has run out', 410);
  if (request.headers.get('Content-Type') !== 'image/jpeg') return text('Send a JPEG', 415);
  const wait = await takeLimit(request, env, 'phonePhotos');
  if (wait != null) return text('Too many photos: wait a little', 429, waitHeaders(wait));

  const photo = await readCapped(request, MAX_PHOTO_BYTES);
  if (!photo) return text('Photo too big', 413);
  const bytes = new Uint8Array(photo);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return text('Send a JPEG', 415);
  }

  const before = await drop(env, code).send(photo);
  if (before === 'gone') return text('Code has run out', 410);
  if (before === 'sent') return text('A photo was already sent', 409);
  return text('Sent', 201);
}

function drop(env: Env, code: string) {
  return env.PHOTO_DROPS.getByName(code);
}

function text(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
