// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

export type Reply = (body: BodyInit | null, status: number, headers?: HeadersInit) => Response;

// For the device endpoints, which Wish Jar's own pages call cross-origin. A
// page from anywhere else is turned away (null reply, send the 403); native
// apps send no Origin and are let through, their token proves who they are.
export function corsReply(request: Request, env: Env): Reply | null {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((entry) => entry.trim());
  if (origin && !allowed.includes(origin)) return null;

  const cors = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  if (origin) cors.set('Access-Control-Allow-Origin', origin);
  return (body, status, headers = {}) => {
    const all = new Headers(cors);
    new Headers(headers).forEach((value, name) => all.set(name, value));
    return new Response(body, { status, headers: all });
  };
}

// The body, or null past `max` bytes, without reading a huge upload to the end.
export async function readCapped(request: Request, max: number): Promise<ArrayBuffer | null> {
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
