import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import siteConfig from '../../wrangler.jsonc?raw';
import readme from '../README.md?raw';
import { fromSomewhere } from './caller';

import {
  blockExpression,
  RELAY_HOST,
  ROUTES,
  SITE_FORWARDED_PATHS,
  SITE_HOST,
  wildcardMatch,
  WORKERS_DEV_PATHS,
} from '../src/routes';

const BASE = `https://${RELAY_HOST}`;
const WORKERS_DEV = 'https://wish-jar-photo-relay.allan-clempe.workers.dev';
const APP = 'https://wish-jar.blastin.dev';
const CODE = 'ABC234';
const PHOTO = `/photos/${'C'.repeat(43)}/${'D'.repeat(43)}.jpg`;

function relay(url: string, init?: RequestInit) {
  return exports.default.fetch(fromSomewhere(new Request(url, init)));
}

// Paths for each route, so every method it lists is tried on one it answers.
const EXAMPLES: Record<string, string[]> = {
  '/': ['/'],
  '/s': [`/s?code=${CODE}`],
  '/s/*': [`/s/${CODE}`, `/s/${CODE}/photo`],
  '/qr/*.svg': [`/qr/${CODE}.svg`, `/qr/join/${CODE}.svg`],
  '/codes': ['/codes'],
  '/codes/*': [`/codes/${CODE}`, `/codes/${CODE}/photo`],
  '/turnstile': ['/turnstile?sitekey=1x00000000000000000000AA'],
  '/families': ['/families'],
  '/jar/call': ['/jar/call'],
  '/jar/live': ['/jar/live'],
  '/devices': ['/devices'],
  '/devices/*': ['/devices/join', '/devices/codes', `/devices/codes/${CODE}`, '/devices/1', '/devices/echo-show'],
  '/photos': ['/photos'],
  '/photos/*/*.jpg': [PHOTO],
};

// Not served: the router's own 404 for a path or method it doesn't know, or
// a 405.
async function served(url: string, method: string): Promise<boolean> {
  const headers: HeadersInit = { Origin: APP };
  if (method === 'OPTIONS') headers['Access-Control-Request-Method'] = 'POST';
  const response = await relay(url, { method, headers });
  const body = method === 'HEAD' ? '' : await response.text();
  return response.status !== 405 && !(response.status === 404 && body === 'Not found');
}

// What the WAF custom rule does, as its expression says (blockExpression).
function blocks(host: string, path: string, method: string): boolean {
  const relayPath = host === RELAY_HOST || SITE_FORWARDED_PATHS.some((pattern) => wildcardMatch(pattern, path));
  const served = ROUTES.some(
    (route) =>
      (route.path.includes('*') ? wildcardMatch(route.path, path) : route.path === path) &&
      route.methods.includes(method),
  );
  return (host === RELAY_HOST || host === SITE_HOST) && relayPath && !served;
}

describe('the WAF custom rule (WJ-58)', () => {
  it('is in README.md as ROUTES makes it', () => {
    const expression = blockExpression(RELAY_HOST, SITE_HOST);
    // Put this in README.md and the dashboard's rule when ROUTES changes.
    expect(readme, `README.md should have the expression:\n${expression}\n`).toContain(`\n${expression}\n`);
    expect(expression.length).toBeLessThan(4096);
  });

  it('lets every route through with every method the relay answers there', async () => {
    for (const { path, methods } of ROUTES) {
      const examples = EXAMPLES[path];
      expect(examples, `examples for ${path}`).toBeDefined();
      for (const example of examples) expect(wildcardMatch(path, new URL(example, BASE).pathname)).toBe(true);
      for (const method of methods) {
        const answers = await Promise.all(examples.map((example) => served(`${BASE}${example}`, method)));
        expect(answers.some(Boolean), `${method} ${path}`).toBe(true);
      }
    }
  });

  it('knows the paths the site passes on to the relay', () => {
    // run_worker_first in the root wrangler.jsonc, the site's.
    const list = siteConfig.match(/"run_worker_first":\s*\[([^\]]*)\]/)?.[1] ?? '';
    const forwarded = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(forwarded).toEqual(SITE_FORWARDED_PATHS);
  });

  it("leaves the site's own pages alone", () => {
    const pages = ['/', '/index.html', '/settings', '/kids', '/join-family', '/turnstile', '/_expo/static/js/web/entry.js'];
    for (const page of pages) expect(blocks(SITE_HOST, page, 'GET'), page).toBe(false);
    // On the relay's address the same paths aren't the relay's.
    expect(blocks(RELAY_HOST, '/settings', 'GET')).toBe(true);
    expect(blocks(RELAY_HOST, '/', 'GET')).toBe(false);
  });

  it('blocks what the relay would turn away, on both addresses', () => {
    for (const host of [RELAY_HOST, SITE_HOST]) {
      expect(blocks(host, '/jar/nope', 'POST'), host).toBe(true);
      expect(blocks(host, '/codes', 'PUT'), host).toBe(true);
      expect(blocks(host, '/photos/a/b/c', 'GET'), host).toBe(true);
      expect(blocks(host, '/jar/call', 'POST'), host).toBe(false);
      expect(blocks(host, PHOTO, 'GET'), host).toBe(false);
    }
    expect(blocks(RELAY_HOST, '/wp-login.php', 'GET')).toBe(true);
    // Other sites on blastin.dev.
    expect(blocks('blastin.dev', '/jar/nope', 'POST')).toBe(false);
  });

  it('matches paths as the wildcard operator does', () => {
    expect(wildcardMatch('/codes', '/codes')).toBe(true);
    expect(wildcardMatch('/codes', '/codes/')).toBe(false);
    expect(wildcardMatch('/codes/*', '/codes/ABC234/photo')).toBe(true);
    expect(wildcardMatch('/qr/*.svg', '/QR/abc234.SVG')).toBe(true);
    expect(wildcardMatch('/qr/*.svg', '/qr/abc234.png')).toBe(false);
    expect(wildcardMatch('/photos/*/*.jpg', '/photos/a/b.jpg')).toBe(true);
    expect(wildcardMatch('/photos/*/*.jpg', '/photos/a.jpg')).toBe(false);
    expect(wildcardMatch('/s', '/sx')).toBe(false);
  });
});

describe('the Worker', () => {
  it('answers 404 to a path not in ROUTES', async () => {
    for (const path of ['/wp-login.php', '/.env', '/jar', '/photos/nope', '/codes/', '/families/1']) {
      const response = await relay(`${BASE}${path}`, { method: 'POST', headers: { Origin: APP } });
      expect(response.status, path).toBe(404);
      expect(await response.text()).toBe('Not found');
    }
  });
});

describe('the workers.dev address (WJ-58)', () => {
  it('still serves the photo codes to builds from before WJ-42', async () => {
    const preflight = await relay(`${WORKERS_DEV}/codes`, {
      method: 'OPTIONS',
      headers: { Origin: APP, 'Access-Control-Request-Method': 'POST' },
    });
    expect(preflight.status).toBe(204);

    const created = await relay(`${WORKERS_DEV}/codes`, { method: 'POST', headers: { Origin: APP } });
    expect(created.status).toBe(201);
    const { code, token, url } = (await created.json()) as { code: string; token: string; url: string };
    // The phone opens the address the device called.
    expect(url).toBe(`${WORKERS_DEV}/s/${code}`);

    expect((await relay(`${WORKERS_DEV}/qr/${code}.svg`)).status).toBe(200);
    expect((await relay(`${WORKERS_DEV}/`)).status).toBe(200);
    const typed = await relay(`${WORKERS_DEV}/s?code=${code}`, { redirect: 'manual' });
    expect(typed.headers.get('Location')).toBe(url);
    expect((await relay(url)).status).toBe(200);

    const jpeg = new Uint8Array(2000);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    const sent = await relay(`${url}/photo`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: jpeg });
    expect(sent.status).toBe(201);
    const auth = { Origin: APP, Authorization: `Bearer ${token}` };
    expect((await relay(`${WORKERS_DEV}/codes/${code}/photo`, { headers: auth })).status).toBe(200);

    // A device that closes the sheet before a photo comes.
    const closed = await relay(`${WORKERS_DEV}/codes`, { method: 'POST', headers: { Origin: APP } });
    const other = (await closed.json()) as { code: string; token: string };
    const close = await relay(`${WORKERS_DEV}/codes/${other.code}`, {
      method: 'DELETE',
      headers: { Origin: APP, Authorization: `Bearer ${other.token}` },
    });
    expect(close.status).toBe(204);
  });

  it('answers 404 to everything else', async () => {
    const others: [string, string][] = [
      ['POST', '/families'],
      ['OPTIONS', '/families'],
      ['POST', '/jar/call'],
      ['GET', '/jar/live'],
      ['GET', '/devices'],
      ['POST', '/devices/join'],
      ['POST', '/devices/echo-show'],
      ['POST', '/photos'],
      ['GET', PHOTO],
      ['GET', '/turnstile'],
      ['GET', '/wp-login.php'],
    ];
    for (const [method, path] of others) {
      const response = await relay(`${WORKERS_DEV}${path}`, { method, headers: { Origin: APP } });
      expect(response.status, `${method} ${path}`).toBe(404);
    }
  });

  it('serves only paths the relay serves anywhere', () => {
    const paths = ROUTES.map((route) => route.path);
    for (const path of WORKERS_DEV_PATHS) expect(paths).toContain(path);
  });
});
