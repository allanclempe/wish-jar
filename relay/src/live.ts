import { takeLimit, waitHeaders } from './CallerLimits';
import { type DeviceToken, parseDeviceToken } from './families';
import { corsReply } from './http';

// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// A family's devices hear about each other's changes over a WebSocket to the
// family's jar (WJ-50); src/jar/api.ts describes it, and FamilyJar keeps the
// sockets.

// The protocol the app asks for and the relay answers with. The token rides
// along as another "protocol" (bearer.<token>), as a browser can't set
// headers on a WebSocket, and a token in the URL would end up in the logs.
export const LIVE_PROTOCOL = 'wish-jar';
const BEARER = 'bearer.';

// The close code for a token the jar doesn't know: the device was removed from
// its family, or the family is gone. The app stops reconnecting.
export const LIVE_REFUSED = 4401;

// What the app sends to tell its socket is still up, and hears back. The jar
// answers it without waking up (setWebSocketAutoResponse).
export const PING = 'ping';
export const PONG = 'pong';

// The device token in the socket's protocol list, or null, as
// parseDeviceToken checks it.
export function liveToken(request: Request, env: Env): DeviceToken | null {
  const offered = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((entry) => entry.trim());
  if (!offered.includes(LIVE_PROTOCOL)) return null;
  const bearer = offered.find((entry) => entry.startsWith(BEARER));
  return bearer ? parseDeviceToken(`Bearer ${bearer.slice(BEARER.length)}`, env) : null;
}

// The reply that hands the app its end of the socket.
export function liveResponse(socket: WebSocket): Response {
  return new Response(null, {
    status: 101,
    webSocket: socket,
    headers: { 'Sec-WebSocket-Protocol': LIVE_PROTOCOL },
  });
}

// A socket closed as soon as it opens, for a token the jar doesn't know. A
// browser can't read the status of a failed upgrade, so a plain 401 would look
// like a lost connection to the app, which would keep trying.
export function refusedSocket(): Response {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.close(LIVE_REFUSED, 'Not a device of this family');
  return liveResponse(client);
}

// GET /jar/live: the socket, from the device's family jar.
export async function liveApi(request: Request, env: Env): Promise<Response> {
  // The same pages as the other device endpoints; a WebSocket has no CORS, so
  // the Origin is checked here.
  if (!corsReply(request, env)) return text('Origin not allowed', 403);
  if (request.method !== 'GET') return text('Use GET', 405);
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return text('Open a WebSocket', 426);
  }
  const device = liveToken(request, env);
  if (!device) return refusedSocket();
  // A failed upgrade looks like a lost connection to the app, which tries
  // again later, backing off: what's wanted here.
  const wait = await takeLimit(request, env, 'live');
  if (wait != null) return text('Too many connections: wait a little', 429, waitHeaders(wait));
  return env.FAMILY_JARS.getByName(device.familyId).fetch(request);
}

function text(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
