import { randomToken } from './codes';
import type { JarOutcome } from './FamilyJar';
import { readCapped, type Reply } from './http';
import type { CreateFamilyReply } from './jar/api';
import { MAX_CALL_BYTES, MAX_IMPORT_BYTES } from './jar/limits';

// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// randomToken's 32 bytes in URL-safe Base64.
const PART = '[A-Za-z0-9_-]{43}';
const DEVICE_TOKEN = new RegExp(`^Bearer (${PART})\\.(${PART})$`);

// A device's token is "<familyId>.<secret>": the family id says which jar to
// open, and the jar checks the secret against the hashes it keeps.
export function parseDeviceToken(header: string | null): { familyId: string; secret: string } | null {
  const match = header?.match(DEVICE_TOKEN);
  return match ? { familyId: match[1], secret: match[2] } : null;
}

// POST /families: a new family and the token of its first device.
export async function createFamily(request: Request, env: Env, reply: Reply): Promise<Response> {
  const body = await readJson(request, MAX_IMPORT_BYTES, reply, true);
  if (body instanceof Response) return body;

  const familyId = randomToken();
  const secret = randomToken();
  // Typed by hand: RPC typing can't carry `unknown` through.
  const outcome = (await env.FAMILY_JARS.getByName(familyId).create(secret, body)) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  const created: CreateFamilyReply = { token: `${familyId}.${secret}`, familyId };
  return reply(JSON.stringify(created), 201, { 'Content-Type': 'application/json' });
}

// POST /jar/call: runs { fn, args } in the device's family jar.
export async function callJar(request: Request, env: Env, reply: Reply): Promise<Response> {
  // Checked before the body is read, so a stranger can't make the relay read
  // megabytes.
  const device = parseDeviceToken(request.headers.get('Authorization'));
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });

  const body = await readJson(request, MAX_CALL_BYTES, reply, false);
  if (body instanceof Response) return body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return reply('Send { fn, args }', 400);
  }
  const { fn, args } = body as { fn?: unknown; args?: unknown };

  const jar = env.FAMILY_JARS.getByName(device.familyId);
  const outcome = (await jar.call(device.secret, fn, args)) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  return reply(JSON.stringify({ result: outcome.result }), 200, { 'Content-Type': 'application/json' });
}

export function refuse(outcome: Extract<JarOutcome, { ok: false }>, reply: Reply): Response {
  const headers: HeadersInit = outcome.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {};
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
