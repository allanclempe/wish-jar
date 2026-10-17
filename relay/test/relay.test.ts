import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { CODE_LETTERS, MAX_PHOTO_BYTES } from '../src/codes';

const BASE = 'https://relay.example';
const APP = 'https://wish-jar.expo.app';

type Code = { code: string; token: string; expiresAt: number; url: string };

function relay(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

async function newCode(): Promise<Code> {
  const response = await relay('/codes', { method: 'POST', headers: { Origin: APP } });
  expect(response.status).toBe(201);
  return response.json();
}

// A JPEG as far as the relay looks: the right first bytes.
function jpeg(size = 2000): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

function send(code: string, body: BodyInit, type = 'image/jpeg') {
  return relay(`/s/${code}/photo`, { method: 'POST', headers: { 'Content-Type': type }, body });
}

function collect(code: string, token: string) {
  return relay(`/codes/${code}/photo`, {
    headers: { Origin: APP, Authorization: `Bearer ${token}` },
  });
}

describe('codes', () => {
  it('hands out a short code, a secret token and the phone link, for 10 minutes', async () => {
    const before = Date.now();
    const { code, token, expiresAt, url } = await newCode();
    expect(code).toHaveLength(6);
    expect([...code].every((letter) => CODE_LETTERS.includes(letter))).toBe(true);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(expiresAt - before).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
    expect(expiresAt - before).toBeLessThanOrEqual(10 * 60_000 + 1000);
    expect(url).toBe(`${BASE}/s/${code}`);
  });

  it('draws the QR code for the phone link as SVG', async () => {
    const { code } = await newCode();
    const response = await relay(`/qr/${code}.svg`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await response.text()).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+".*<path d="M/);
  });
});

describe('phone page', () => {
  it('shows the photo picker for an open code, typed in any case', async () => {
    const { code } = await newCode();
    const response = await relay(`/s/${code.toLowerCase()}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain(`<b>${code}</b>`);
    expect(html).toContain('accept="image/*"');
  });

  it('takes a typed code from the home page to its page', async () => {
    expect((await relay('/')).status).toBe(200);
    const response = await relay('/s?code=k7p+4xm', { redirect: 'manual' });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(`${BASE}/s/K7P4XM`);
    expect((await relay('/s?code=nope')).status).toBe(400);
  });

  it('says when a code has run out', async () => {
    const response = await relay('/s/K7P4XM');
    expect(response.status).toBe(410);
    expect(await response.text()).toContain('This code has run out');
  });
});

describe('sending and collecting', () => {
  it('hands the photo to the device once, then forgets the code', async () => {
    const { code, token } = await newCode();
    expect((await collect(code, token)).status).toBe(204);

    const photo = jpeg();
    expect((await send(code, photo)).status).toBe(201);
    expect((await send(code, photo)).status).toBe(409);

    const collected = await collect(code, token);
    expect(collected.status).toBe(200);
    expect(collected.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await collected.arrayBuffer())).toEqual(photo);

    expect((await collect(code, token)).status).toBe(410);
    expect((await send(code, photo)).status).toBe(410);
    expect((await relay(`/s/${code}`)).status).toBe(410);
  });

  it('only gives the photo to the device holding the token', async () => {
    const { code, token } = await newCode();
    await send(code, jpeg());
    expect((await collect(code, 'not-the-token')).status).toBe(403);
    expect((await collect(code, '')).status).toBe(403);
    expect((await relay(`/codes/${code}`, { method: 'DELETE' })).status).toBe(403);
    expect((await collect(code, token)).status).toBe(200);
  });

  it('drops the code when the device cancels', async () => {
    const { code, token } = await newCode();
    const cancel = await relay(`/codes/${code}`, {
      method: 'DELETE',
      headers: { Origin: APP, Authorization: `Bearer ${token}` },
    });
    expect(cancel.status).toBe(204);
    expect((await send(code, jpeg())).status).toBe(410);
  });

  it('turns away photos that are too big or not JPEGs', async () => {
    const { code, token } = await newCode();
    expect((await send(code, jpeg(MAX_PHOTO_BYTES + 1))).status).toBe(413);
    expect((await send(code, jpeg(), 'image/png')).status).toBe(415);
    expect((await send(code, new Uint8Array(100))).status).toBe(415);
    // Still open for a good one.
    expect((await send(code, jpeg(MAX_PHOTO_BYTES))).status).toBe(201);
    expect((await collect(code, token)).status).toBe(200);
  });

  it('turns away a too-big photo sent without a length up front', async () => {
    const { code } = await newCode();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(jpeg(MAX_PHOTO_BYTES));
        controller.enqueue(new Uint8Array(10));
        controller.close();
      },
    });
    expect((await send(code, body)).status).toBe(413);
  });
});

describe('expiry', () => {
  it('drops everything when the code runs out', async () => {
    const { code, token } = await newCode();
    await send(code, jpeg());
    const stub = env.PHOTO_DROPS.getByName(code);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runInDurableObject(stub, (_, state) => state.storage.list())).toHaveProperty(
      'size',
      0,
    );
    expect((await collect(code, token)).status).toBe(410);
  });

  it('turns away a code past its time even before the alarm runs', async () => {
    const { code, token } = await newCode();
    const stub = env.PHOTO_DROPS.getByName(code);
    await runInDurableObject(stub, async (_, state) => {
      const drop = await state.storage.get<{ expiresAt: number }>('drop');
      await state.storage.put('drop', { ...drop, expiresAt: Date.now() - 1 });
    });
    expect((await send(code, jpeg())).status).toBe(410);
    expect((await collect(code, token)).status).toBe(410);
    expect((await relay(`/s/${code}`)).status).toBe(410);
  });
});

describe('CORS', () => {
  it("lets Wish Jar's pages in", async () => {
    const response = await relay('/codes', { method: 'POST', headers: { Origin: APP } });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(response.headers.get('Vary')).toBe('Origin');

    const preflight = await relay('/codes/K7P4XM/photo', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8081',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Authorization');
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });

  it('keeps other sites out', async () => {
    const response = await relay('/codes', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();

    // The phone's upload is same-origin only.
    const { code } = await newCode();
    const upload = await relay(`/s/${code}/photo`, {
      method: 'OPTIONS',
      headers: { Origin: APP, 'Access-Control-Request-Method': 'POST' },
    });
    expect(upload.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('Worker', () => {
  // workerd won't start a main module that exports anything else.
  it('exports only handlers and classes', async () => {
    const main: Record<string, unknown> = await import('../src/index');
    for (const [name, value] of Object.entries(main)) {
      expect(typeof value === 'function' || name === 'default', name).toBe(true);
    }
  });
});
