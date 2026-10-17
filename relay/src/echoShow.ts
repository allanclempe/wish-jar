import { randomToken } from './codes';
import { parseDeviceToken, readJson, refuse } from './families';
import type { JarOutcome } from './FamilyJar';
import type { Reply } from './http';
import type { CreateFamilyReply } from './jar/api';

// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// Alexa device ids (amzn1.ask.device.…) run to a couple of hundred
// characters. The id is all an Echo Show has to prove it's in a family, so a
// short one is turned away rather than linked.
export const MIN_ALEXA_DEVICE_ID_LENGTH = 32;
export const MAX_ALEXA_DEVICE_ID_LENGTH = 512;
const MAX_ECHO_SHOW_BYTES = 2048;

// What the relay keeps instead of the Alexa device id: the name of the Show's
// EchoShowLink and the mark on its device row in the family's jar.
export async function echoShowHash(alexaDeviceId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`wish-jar-echo-show:${alexaDeviceId}`),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The Echo Show (WJ-45); src/jar/api.ts lists the endpoints. Its storage is
// wiped at the end of every skill session, so it can't keep a token: once
// it's in a family (started a jar, or joined with a code), it links its Alexa
// device id, and at every launch after that it gets a new token for the same
// device row with that id.
export async function echoShowApi(request: Request, env: Env, pathname: string, reply: Reply): Promise<Response> {
  if (request.method !== 'POST') return reply('Use POST', 405, { Allow: 'POST, OPTIONS' });
  return pathname === '/devices/echo-show/link' ? link(request, env, reply) : rejoin(request, env, reply);
}

// POST /devices/echo-show/link (device token): this device is the Echo Show
// with this Alexa device id.
async function link(request: Request, env: Env, reply: Reply): Promise<Response> {
  const device = parseDeviceToken(request.headers.get('Authorization'));
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });
  const alexaDeviceId = await readAlexaDeviceId(request, reply);
  if (alexaDeviceId instanceof Response) return alexaDeviceId;

  const hash = await echoShowHash(alexaDeviceId);
  const jar = env.FAMILY_JARS.getByName(device.familyId);
  const outcome = (await jar.linkEchoShow(device.secret, hash)) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  await env.ECHO_SHOW_LINKS.getByName(hash).link(device.familyId);
  return reply(null, 204);
}

// POST /devices/echo-show (no token): the Show's family and a new token for
// its device row. 404 when it was never linked, or its family no longer has
// it.
async function rejoin(request: Request, env: Env, reply: Reply): Promise<Response> {
  const alexaDeviceId = await readAlexaDeviceId(request, reply);
  if (alexaDeviceId instanceof Response) return alexaDeviceId;

  const hash = await echoShowHash(alexaDeviceId);
  const showLink = env.ECHO_SHOW_LINKS.getByName(hash);
  const familyId = await showLink.familyId();
  if (!familyId) return reply('This Echo Show is not in a family', 404);

  const secret = randomToken();
  const outcome = (await env.FAMILY_JARS.getByName(familyId).rejoinEchoShow(hash, secret)) as JarOutcome;
  if (!outcome.ok) {
    if (outcome.status === 404) await showLink.unlink(familyId);
    return refuse(outcome, reply);
  }
  const rejoined: CreateFamilyReply = { token: `${familyId}.${secret}`, familyId };
  return reply(JSON.stringify(rejoined), 200, { 'Content-Type': 'application/json' });
}

async function readAlexaDeviceId(request: Request, reply: Reply): Promise<string | Response> {
  const body = await readJson(request, MAX_ECHO_SHOW_BYTES, reply, false);
  if (body instanceof Response) return body;
  const id =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as { alexaDeviceId?: unknown }).alexaDeviceId
      : undefined;
  if (
    typeof id !== 'string' ||
    id.length < MIN_ALEXA_DEVICE_ID_LENGTH ||
    id.length > MAX_ALEXA_DEVICE_ID_LENGTH
  ) {
    return reply('Send { alexaDeviceId }, the Alexa device id', 400);
  }
  return id;
}
