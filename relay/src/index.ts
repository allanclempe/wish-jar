import { backupName, MAX_BACKUP_BYTES, MIN_BACKUP_KEY_LENGTH } from './backups';
import { CODE_TTL_MS, MAX_PHOTO_BYTES, normaliseCode, randomCode, randomToken } from './codes';
import { JarBackup } from './JarBackup';
import { codePage, homePage, htmlResponse } from './pages';
import { PhotoDrop } from './PhotoDrop';
import { qrSvg } from './qr';

export { JarBackup, PhotoDrop };

// Wish Jar (the device) asks for a code and collects the photo through /codes,
// with CORS; the phone gets its page, sends the photo and the QR code is drawn
// from this Worker itself, so the phone never opens Wish Jar.
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/codes' || pathname.startsWith('/codes/') || pathname === '/backup') {
      return api(request, env, url);
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

    const qr = pathname.match(/^\/qr\/([^/]+)\.svg$/);
    if (method === 'GET' && qr) {
      const code = normaliseCode(qr[1]);
      if (!code) return text('No such code', 404);
      return new Response(qrSvg(`${url.origin}/s/${code}`), {
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
//
// And the Echo Show's database backup (WJ-45), with its Alexa device id as the
// bearer key:
//   GET    /backup             → 200 the snapshot, 404 none yet, 401
//   PUT    /backup             → 204, 401, 413
async function api(request: Request, env: Env, url: URL): Promise<Response> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((entry) => entry.trim());
  if (origin && !allowed.includes(origin)) return text('Origin not allowed', 403);

  const cors = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  if (origin) cors.set('Access-Control-Allow-Origin', origin);
  const reply = (body: BodyInit | null, status: number, headers: HeadersInit = {}) => {
    const all = new Headers(cors);
    new Headers(headers).forEach((value, name) => all.set(name, value));
    return new Response(body, { status, headers: all });
  };

  if (request.method === 'OPTIONS') {
    return reply(null, 204, {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
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

  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1] ?? '';

  if (url.pathname === '/backup') {
    if (token.length < MIN_BACKUP_KEY_LENGTH) return reply('Missing backup key', 401);
    const backup = env.JAR_BACKUPS.getByName(await backupName(token));
    if (request.method === 'GET') {
      const snapshot = await backup.load();
      if (!snapshot) return reply('No backup yet', 404);
      return reply(snapshot, 200, { 'Content-Type': 'application/octet-stream' });
    }
    if (request.method === 'PUT') {
      const snapshot = await readCapped(request, MAX_BACKUP_BYTES);
      if (!snapshot) return reply('Backup too big', 413);
      if (snapshot.byteLength === 0) return reply('Empty backup', 400);
      await backup.save(snapshot);
      return reply(null, 204);
    }
    return reply('Not found', 404);
  }

  const match = url.pathname.match(/^\/codes\/([^/]+)(\/photo)?$/);
  const code = match && normaliseCode(match[1]);
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

// The body, or null past `max` bytes, without reading a huge upload to the end.
async function readCapped(request: Request, max: number): Promise<ArrayBuffer | null> {
  if (Number(request.headers.get('Content-Length')) > max) return null;
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
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
