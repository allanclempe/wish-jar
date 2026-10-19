import { waitHeaders } from './CallerLimits';
import { randomToken } from './codes';
import { forgetPhotos, photoBase, photoKeys } from './familyPhotos';
import type { JarOutcome } from './FamilyJar';
import { giveBackFamilyStart, takeFamilyStart } from './FamilyStarts';
import { readCapped, type Reply } from './http';
import type { CreateFamilyReply } from '@wish-jar/jar';
import { MAX_CALL_BYTES, MAX_IMPORT_BYTES } from './jar/limits';
import { deviceSignature, deviceSignatureOk, unsignedAllowed } from './signing';

// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// randomToken's 32 bytes in URL-safe Base64, and an HMAC's too.
const PART = '[A-Za-z0-9_-]{43}';
const DEVICE_TOKEN = new RegExp(`^Bearer (${PART})\\.(${PART})(?:\\.(\\d{1,15})\\.(${PART}))?$`);

export type DeviceToken = { familyId: string; secret: string; signed: boolean };

// A device's token is "<familyId>.<secret>.<deviceId>.<signature>": the
// family id says which jar to open, and the jar checks the secret against the
// hashes it keeps. The signature (WJ-55, src/signing.ts), over the family id
// and the device's id, is checked first, so a made-up token is turned away
// (null, send the 401) without waking any jar. A token from before WJ-55 is
// only "<familyId>.<secret>": taken until UNSIGNED_UNTIL, and swapped for a
// signed one by POST /devices/token, which takes it after the cut-off too
// (`unsignedOk`).
export function parseDeviceToken(
  header: string | null,
  env: Env,
  unsignedOk = unsignedAllowed(),
): DeviceToken | null {
  const match = header?.match(DEVICE_TOKEN);
  if (!match) return null;
  const [, familyId, secret, deviceId, signature] = match;
  if (signature === undefined) return unsignedOk ? { familyId, secret, signed: false } : null;
  return deviceSignatureOk(env, familyId, Number(deviceId), signature)
    ? { familyId, secret, signed: true }
    : null;
}

// The token of the device with this secret and id.
export function deviceToken(env: Env, familyId: string, secret: string, deviceId: number): string {
  return `${familyId}.${secret}.${deviceId}.${deviceSignature(env, familyId, deviceId)}`;
}

// Which running app a call or a socket is from (WJ-50), so a change isn't sent
// back to the app that made it. Not a secret: a random id the app picks at
// launch. Anything else counts as none.
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function clientId(value: unknown): string | null {
  return typeof value === 'string' && CLIENT_ID.test(value) ? value : null;
}

// POST /families: a new family and the token of its first device.
export async function createFamily(request: Request, env: Env, reply: Reply): Promise<Response> {
  const body = await readJson(request, MAX_IMPORT_BYTES, reply, true);
  if (body instanceof Response) return body;
  // Everyone's day (WJ-57, src/FamilyStarts.ts): counted once the body is
  // read, and given back when the jar turns the family down, so only families
  // that start count.
  const full = await takeFamilyStart(env);
  if (full != null) {
    const why = 'Wish Jar has started all the new family jars it can today: try again tomorrow';
    return reply(why, 429, waitHeaders(full));
  }

  const familyId = randomToken();
  const secret = randomToken();
  // Typed by hand: RPC typing can't carry `unknown` through.
  const outcome = (await env.FAMILY_JARS.getByName(familyId).create(
    secret,
    body,
    photoBase(request, familyId),
  )) as JarOutcome;
  if (!outcome.ok) {
    await giveBackFamilyStart(env);
    return refuse(outcome, reply);
  }
  const created: CreateFamilyReply = { token: deviceToken(env, familyId, secret, outcome.result as number), familyId };
  return reply(JSON.stringify(created), 201, { 'Content-Type': 'application/json' });
}

// DELETE /families: deletes the whole family of the device asking (WJ-76),
// with its photos and every device's way in. It can't be undone.
export async function deleteFamily(request: Request, env: Env, reply: Reply): Promise<Response> {
  const device = parseDeviceToken(request.headers.get('Authorization'), env);
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });
  const outcome = (await env.FAMILY_JARS.getByName(device.familyId).deleteByDevice(device.secret)) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  // The jar has purged its photos everywhere already; this data centre's copy
  // goes too, for when the purge token isn't set.
  const urls = photoKeys(device.familyId, outcome.dropped ?? [], new URL(request.url).origin);
  await Promise.all(urls.map((url) => caches.default.delete(url)));
  return reply(null, 204);
}

// POST /jar/call: runs { fn, args } in the device's family jar, for the app
// `client` names.
export async function callJar(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  reply: Reply,
): Promise<Response> {
  // Checked before the body is read, so a stranger can't make the API read
  // megabytes.
  const device = parseDeviceToken(request.headers.get('Authorization'), env);
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });

  const body = await readJson(request, MAX_CALL_BYTES, reply, false);
  if (body instanceof Response) return body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return reply('Send { fn, args }', 400);
  }
  const { fn, args, client } = body as { fn?: unknown; args?: unknown; client?: unknown };

  const jar = env.FAMILY_JARS.getByName(device.familyId);
  const outcome = (await jar.call(
    device.secret,
    fn,
    args,
    photoBase(request, device.familyId),
    clientId(client),
  )) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  await forgetPhotos(request, env, ctx, device.familyId, outcome.dropped);
  return reply(JSON.stringify({ result: outcome.result }), 200, { 'Content-Type': 'application/json' });
}

export function refuse(outcome: Extract<JarOutcome, { ok: false }>, reply: Reply): Response {
  const headers: HeadersInit =
    outcome.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : outcome.wait ? waitHeaders(outcome.wait) : {};
  return reply(outcome.error, outcome.status, headers);
}

// The JSON body, or the reply turning it away. An empty body is {} when
// `optional`, as POST /families may come without one.
export async function readJson(
  request: Request,
  max: number,
  reply: Reply,
  optional: boolean,
): Promise<unknown> {
  const raw = await readCapped(request, max);
  if (raw === null) return reply('Too big', 413);
  if (raw.byteLength === 0 && optional) return {};
  const type = request.headers.get('Content-Type') ?? '';
  if (!/^application\/json(;|$)/i.test(type)) return reply('Send JSON', 415);
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return reply('Not valid JSON', 400);
  }
}
