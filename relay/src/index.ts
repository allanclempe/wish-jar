import { CODE_TTL_MS, MAX_PHOTO_BYTES, normaliseCode, randomCode, randomToken } from './codes';
import { devicesApi } from './devices';
import { callJar, createFamily } from './families';
import { FamilyJar } from './FamilyJar';
import { corsReply, readCapped } from './http';
import { JoinAttempts, JoinCode } from './JoinCode';
import { codePage, homePage, htmlResponse } from './pages';
import { PhotoDrop } from './PhotoDrop';
import { qrSvg } from './qr';

export { FamilyJar, JoinAttempts, JoinCode, PhotoDrop };

// Wish Jar (the device) asks for a code and collects the photo through /codes,
// with CORS; the phone gets its page, sends the photo and the QR code is drawn
// from this Worker itself, so the phone never opens Wish Jar.
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/codes' || pathname.startsWith('/codes/')) {
      return api(request, env, url);
    }
    if (pathname === '/families' || pathname === '/jar/call') {
      return familyApi(request, env, pathname);
    }
    // A family's devices and their join codes (WJ-48), for Wish Jar on any
    // device: src/devices.ts.
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
//   POST   /codes              → 201 { code, token, expiresAt, url }
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
//   POST /families   { label?, jar? }  → 201 { token, familyId }, 400, 413
//   POST /jar/call   { fn, args }      → 200 { result }, 400, 401, 413, 507
// A device's token (Authorization: Bearer <familyId>.<secret>) opens its
// family's jar; src/jar/api.ts lists the functions and their arguments.
async function familyApi(request: Request, env: Env, pathname: string): Promise<Response> {
  const reply = corsReply(request, env);
  if (!reply) return text('Origin not allowed', 403);

  if (request.method === 'OPTIONS') {
    return reply(null, 204, {
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    });
  }
  if (request.method !== 'POST') return reply('Use POST', 405, { Allow: 'POST, OPTIONS' });
  return pathname === '/families' ? createFamily(request, env, reply) : callJar(request, env, reply);
}

// The phone's photo, already cropped and shrunk by its page (src/pages.ts).
async function receivePhoto(request: Request, env: Env, rawCode: string): Promise<Response> {
  const code = normaliseCode(rawCode);
  if (!code) return text('Code has run out', 410);
  if (request.headers.get('Content-Type') !== 'image/jpeg') return text('Send a JPEG', 415);

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

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
