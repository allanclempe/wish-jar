import { takeLimit, waitHeaders } from './CallerLimits';
import { randomToken } from './codes';
import { deviceToken, parseDeviceToken, readJson, refuse } from './families';
import type { JarOutcome } from './FamilyJar';
import type { Reply } from './http';
import type { CreateFamilyReply } from './jar/api';

// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// Alexa device ids (amzn1.ask.device.…) run to a couple of hundred
// characters. A short one is turned away rather than linked.
export const MIN_ALEXA_DEVICE_ID_LENGTH = 32;
export const MAX_ALEXA_DEVICE_ID_LENGTH = 512;
// The Show's secret (WJ-60): random, kept per Show by the Alexa skill, which
// hands it to the page at launch with the device id.
export const MIN_ECHO_SHOW_SECRET_LENGTH = 32;
export const MAX_ECHO_SHOW_SECRET_LENGTH = 512;
const MAX_ECHO_SHOW_BYTES = 2048;

// What the relay keeps instead of the Alexa device id: the name of the Show's
// EchoShowLink and the mark on its device row in the family's jar.
export async function echoShowHash(alexaDeviceId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`wish-jar-echo-show:${alexaDeviceId}`),
  );
  return hex(digest);
}

// What EchoShowLink keeps instead of the Show's secret.
export async function echoShowSecretHash(showSecret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`wish-jar-echo-show-secret:${showSecret}`),
  );
  return hex(digest);
}

function hex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The Echo Show (WJ-45); src/jar/api.ts lists the endpoints. Its storage is
// wiped at the end of every skill session, so it can't keep a token: once
// it's in a family (started a jar, or joined with a code), it links its Alexa
// device id, and at every launch after that it gets a new token for the same
// device row with that id and its secret (WJ-60). A Show linked before the
// secret has none stored, and joins with a code again.
export async function echoShowApi(request: Request, env: Env, pathname: string, reply: Reply): Promise<Response> {
  if (request.method !== 'POST') return reply('Use POST', 405, { Allow: 'POST, OPTIONS' });
  return pathname === '/devices/echo-show/link' ? link(request, env, reply) : rejoin(request, env, reply);
}

// POST /devices/echo-show/link (device token): this device is the Echo Show
// with this Alexa device id. A Show another family has, with a secret, moves
// only with that secret (403 otherwise).
async function link(request: Request, env: Env, reply: Reply): Promise<Response> {
  const device = parseDeviceToken(request.headers.get('Authorization'), env);
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });
  const show = await readEchoShow(request, reply);
  if (show instanceof Response) return show;

  const hash = await echoShowHash(show.alexaDeviceId);
  const showLink = env.ECHO_SHOW_LINKS.getByName(hash);
  const taken = () => reply('This Echo Show is in another family', 403);
  // Asked before the jar marks the row, and again as the link is kept, in case
  // another family linked it meanwhile.
  if (!(await showLink.mayLink(device.familyId, show.secretHash))) {
    // Unless the family it's in no longer has it: removed while the skill
    // lost its secret, the Show would be stuck there for good.
    const linkedTo = await showLink.familyId();
    if (linkedTo && (await env.FAMILY_JARS.getByName(linkedTo).hasEchoShow(hash))) return taken();
    if (linkedTo) await showLink.unlink(linkedTo);
  }
  const jar = env.FAMILY_JARS.getByName(device.familyId);
  const outcome = (await jar.linkEchoShow(device.secret, hash)) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  if (!(await showLink.link(device.familyId, show.secretHash))) {
    // The row marked above isn't the Show's after all.
    await jar.unmarkEchoShow(hash);
    return taken();
  }
  return reply(null, 204);
}

// POST /devices/echo-show (no token): the Show's family and a new token for
// its device row. 404 when it was never linked, its family no longer has it,
// or the secret isn't the one kept for it: the jar isn't asked then, so the
// Show's row keeps its token.
async function rejoin(request: Request, env: Env, reply: Reply): Promise<Response> {
  const show = await readEchoShow(request, reply);
  if (show instanceof Response) return show;

  const wait = await takeLimit(request, env, 'echoShows');
  if (wait != null) return reply('Too many tries: wait a little', 429, waitHeaders(wait));
  const hash = await echoShowHash(show.alexaDeviceId);
  const showLink = env.ECHO_SHOW_LINKS.getByName(hash);
  const familyId = await showLink.rejoin(show.secretHash);
  if (!familyId) return reply('This Echo Show is not in a family', 404);

  const secret = randomToken();
  const outcome = (await env.FAMILY_JARS.getByName(familyId).rejoinEchoShow(hash, secret)) as JarOutcome;
  if (!outcome.ok) {
    if (outcome.status === 404) await showLink.unlink(familyId);
    return refuse(outcome, reply);
  }
  const rejoined: CreateFamilyReply = { token: deviceToken(env, familyId, secret, outcome.result as number), familyId };
  return reply(JSON.stringify(rejoined), 200, { 'Content-Type': 'application/json' });
}

type EchoShow = { alexaDeviceId: string; secretHash: string };

// The Show's id, and the hash of its secret.
async function readEchoShow(request: Request, reply: Reply): Promise<EchoShow | Response> {
  const body = await readJson(request, MAX_ECHO_SHOW_BYTES, reply, false);
  if (body instanceof Response) return body;
  const { alexaDeviceId: id, showSecret } =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as { alexaDeviceId?: unknown; showSecret?: unknown })
      : {};
  if (
    typeof id !== 'string' ||
    id.length < MIN_ALEXA_DEVICE_ID_LENGTH ||
    id.length > MAX_ALEXA_DEVICE_ID_LENGTH
  ) {
    return reply('Send { alexaDeviceId }, the Alexa device id', 400);
  }
  if (
    typeof showSecret !== 'string' ||
    showSecret.length < MIN_ECHO_SHOW_SECRET_LENGTH ||
    showSecret.length > MAX_ECHO_SHOW_SECRET_LENGTH
  ) {
    return reply('Send { showSecret }, the secret the Alexa skill gave', 400);
  }
  return { alexaDeviceId: id, secretHash: await echoShowSecretHash(showSecret) };
}
