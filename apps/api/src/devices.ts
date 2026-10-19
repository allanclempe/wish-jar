import { callerKey, takeLimit, waitHeaders } from './CallerLimits';
import { CODE_TTL_MS, normaliseCode, randomCode, randomToken } from './codes';
import { deviceToken, parseDeviceToken, readJson, refuse } from './families';
import { echoShowApi } from './echoShow';
import type { JarOutcome } from './FamilyJar';
import type { Reply } from './http';
import type { CreateFamilyReply, Device, DeviceList, JoinCode } from '@wish-jar/jar';
import { JarError, label } from './jar/validate';
import { unsignedAllowed } from './signing';
import { countUsage } from './usage';

// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// A join request is a code and a label.
const MAX_JOIN_BYTES = 1024;

// The family's devices (WJ-48); packages/jar/src/api.ts lists the endpoints. Every one
// but /devices/join and the Echo Show's rejoin (echoShow.ts) needs a device of
// the family (Authorization: Bearer).
export async function devicesApi(request: Request, env: Env, url: URL, reply: Reply): Promise<Response> {
  const { pathname } = url;
  const method = request.method;
  if (pathname === '/devices/join') {
    return method === 'POST' ? joinFamily(request, env, reply) : useMethod('POST', reply);
  }
  if (pathname === '/devices/echo-show' || pathname === '/devices/echo-show/link') {
    return echoShowApi(request, env, pathname, reply);
  }

  if (pathname === '/devices/token') {
    return method === 'POST' ? signToken(request, env, reply) : useMethod('POST', reply);
  }

  const device = parseDeviceToken(request.headers.get('Authorization'), env);
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });
  const jar = env.FAMILY_JARS.getByName(device.familyId);

  if (pathname === '/devices') {
    if (method !== 'GET') return useMethod('GET', reply);
    const outcome = (await jar.listDevices(device.secret)) as JarOutcome;
    if (!outcome.ok) return refuse(outcome, reply);
    const list: DeviceList = { devices: outcome.result as Device[] };
    return reply(JSON.stringify(list), 200, { 'Content-Type': 'application/json' });
  }

  if (pathname === '/devices/codes') {
    if (method !== 'POST') return useMethod('POST', reply);
    const wait = await takeLimit(request, env, 'joinCodes');
    if (wait != null) return reply('Too many codes: wait a little', 429, waitHeaders(wait));
    const checked = (await jar.check(device.secret)) as JarOutcome;
    if (!checked.ok) return refuse(checked, reply);
    const expiresAt = Date.now() + CODE_TTL_MS;
    // A clash is rare (31^6 codes), but a code in use is never handed out twice.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      if (await env.JOIN_CODES.getByName(code).open(device.familyId, expiresAt)) {
        const created: JoinCode = { code, expiresAt, url: `${env.APP_URL}/?join=${code}` };
        return reply(JSON.stringify(created), 201, { 'Content-Type': 'application/json' });
      }
    }
    return reply('No free code, try again', 503);
  }

  const codeMatch = pathname.match(/^\/devices\/codes\/([^/]+)$/);
  if (codeMatch) {
    if (method !== 'DELETE') return useMethod('DELETE', reply);
    const code = normaliseCode(codeMatch[1]);
    if (!code) return reply('Code has run out', 410);
    const checked = (await jar.check(device.secret)) as JarOutcome;
    if (!checked.ok) return refuse(checked, reply);
    const result = await env.JOIN_CODES.getByName(code).close(device.familyId);
    if (result === 'forbidden') return reply('Not your code', 403);
    if (result === 'gone') return reply('Code has run out', 410);
    return reply(null, 204);
  }

  const deviceMatch = pathname.match(/^\/devices\/(\d{1,15})$/);
  if (deviceMatch) {
    if (method !== 'DELETE') return useMethod('DELETE', reply);
    const outcome = (await jar.removeDevice(device.secret, Number(deviceMatch[1]))) as JarOutcome;
    if (!outcome.ok) return refuse(outcome, reply);
    return reply(null, 204);
  }
  return reply('Not found', 404);
}

// POST /devices/token: a signed token for this device (WJ-55), for one from
// before the signatures: the same secret, so nothing else changes. It takes an
// unsigned token after the cut-off too, so a device that wasn't opened until
// then still keeps its family; those are counted per caller, as they wake the
// jar unsigned.
async function signToken(request: Request, env: Env, reply: Reply): Promise<Response> {
  const device = parseDeviceToken(request.headers.get('Authorization'), env, true);
  if (!device) return reply('Not a device of this family', 401, { 'WWW-Authenticate': 'Bearer' });
  if (!device.signed && !unsignedAllowed()) {
    const wait = await takeLimit(request, env, 'tokenSwaps');
    if (wait != null) return reply('Too many tries: wait a little', 429, waitHeaders(wait));
  }
  const checked = (await env.FAMILY_JARS.getByName(device.familyId).check(device.secret)) as JarOutcome;
  if (!checked.ok) return refuse(checked, reply);
  const signed: CreateFamilyReply = {
    token: deviceToken(env, device.familyId, device.secret, checked.result as number),
    familyId: device.familyId,
  };
  return reply(JSON.stringify(signed), 200, { 'Content-Type': 'application/json' });
}

// POST /devices/join: a new device's own token, for the family whose code it
// typed. The code works once; a caller typing wrong codes is slowed down.
async function joinFamily(request: Request, env: Env, reply: Reply): Promise<Response> {
  const body = await readJson(request, MAX_JOIN_BYTES, reply, false);
  if (body instanceof Response) return body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return reply('Send { code, label }', 400);
  }
  const { code: rawCode, label: rawLabel } = body as { code?: unknown; label?: unknown };
  const code = typeof rawCode === 'string' ? normaliseCode(rawCode) : null;
  if (!code) return reply("That's not a code: it's 6 letters and numbers", 400);
  // Checked before the code is used up, so a bad label doesn't waste it.
  let deviceLabel: string | null;
  try {
    deviceLabel = label(rawLabel);
  } catch (error) {
    if (error instanceof JarError) return reply(error.message, 400);
    throw error;
  }

  const wait = await takeLimit(request, env, 'joins');
  if (wait != null) return reply('Too many tries: wait a little', 429, waitHeaders(wait));
  const attempts = env.JOIN_ATTEMPTS.getByName(callerKey(request));
  // Counted as a miss up front, and given back below if the code was right.
  const window = await attempts.attempt();
  if (window == null) {
    return reply('Too many wrong codes: wait a few minutes', 429, waitHeaders(15 * 60));
  }
  const familyId = await env.JOIN_CODES.getByName(code).claim();
  if (!familyId) return reply('That code has run out or was already used', 410);
  await attempts.right(window);

  const secret = randomToken();
  const outcome = (await env.FAMILY_JARS.getByName(familyId).addDevice(secret, deviceLabel)) as JarOutcome;
  if (!outcome.ok) return refuse(outcome, reply);
  countUsage(env, 'device_joined');
  const joined: CreateFamilyReply = { token: deviceToken(env, familyId, secret, outcome.result as number), familyId };
  return reply(JSON.stringify(joined), 201, { 'Content-Type': 'application/json' });
}

function useMethod(allow: string, reply: Reply): Response {
  return reply(`Use ${allow}`, 405, { Allow: `${allow}, OPTIONS` });
}
