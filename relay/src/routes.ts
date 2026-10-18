// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// Every path the relay serves and the methods it answers there, CORS
// preflights (OPTIONS) included. The WAF custom rule in README.md ("Paths and
// methods the relay doesn't serve", WJ-58) blocks everything else on
// wish-jar-api.blastin.dev, and on the paths the site passes on to the relay
// at wish-jar.blastin.dev (SITE_FORWARDED_PATHS), so a route added to
// src/index.ts must be added here too: the Worker turns away any path not
// listed (servedPath). The rule is made from this list (blockExpression) and
// deployed with the relay (scripts/waf.ts, WJ-70).
//
// A path is exact, or a WAF wildcard: `*` is any run of characters, `/`
// included, and the match ignores case (the `wildcard` operator; the Free plan
// has no regex).
export type Route = { path: string; methods: readonly string[] };

export const ROUTES: readonly Route[] = [
  // The phone's side of a photo code (WJ-41): the page, the typed code, the
  // photo it sends, and the QR code the device shows.
  { path: '/', methods: ['GET'] },
  { path: '/s', methods: ['GET'] },
  { path: '/s/*', methods: ['GET', 'POST'] },
  { path: '/qr/*.svg', methods: ['GET'] },
  // The device's side of a photo code.
  { path: '/codes', methods: ['POST', 'OPTIONS'] },
  { path: '/codes/*', methods: ['GET', 'DELETE', 'OPTIONS'] },
  // The Turnstile page for the phone app's WebView (WJ-54).
  { path: '/turnstile', methods: ['GET'] },
  // The family jar (WJ-46), its live socket (WJ-50), devices (WJ-48, WJ-45)
  // and photos (WJ-49). A photo is shown to an <img>, which may ask for HEAD.
  { path: '/families', methods: ['POST', 'OPTIONS'] },
  { path: '/jar/call', methods: ['POST', 'OPTIONS'] },
  { path: '/jar/live', methods: ['GET'] },
  { path: '/devices', methods: ['GET', 'OPTIONS'] },
  { path: '/devices/*', methods: ['POST', 'DELETE', 'OPTIONS'] },
  { path: '/photos', methods: ['POST', 'OPTIONS'] },
  { path: '/photos/*/*.jpg', methods: ['GET', 'HEAD', 'DELETE', 'OPTIONS'] },
];

// The relay's own address (wrangler.jsonc's routes), and the site's (the root
// wrangler.jsonc), which took wish-jar.blastin.dev from the relay in WJ-63.
export const RELAY_HOST = 'wish-jar-api.blastin.dev';
export const SITE_HOST = 'wish-jar.blastin.dev';

// The paths the site's Worker passes on to the relay unchanged, through a
// service binding (site/worker.js): `run_worker_first` in the root
// wrangler.jsonc, which test/routes.test.ts keeps this the same as. Every
// other path there is the site's own, served from its static assets without
// reaching either Worker, so the WAF rule leaves it alone: the relay's `/` and
// `/turnstile` are the site's home page and not-found screen there. A path
// here is a `*` glob for run_worker_first, and the rule matches it with the
// `wildcard` operator, which ignores case: it may take in a few more paths
// than the site passes on, none of them a page of the site.
export const SITE_FORWARDED_PATHS: readonly string[] = [
  '/codes',
  '/codes/*',
  '/families',
  '/jar/*',
  '/devices',
  '/devices/*',
  '/photos',
  '/photos/*',
  '/s',
  '/s/*',
  '/qr/*',
];

// The paths still answered on the workers.dev address, for the builds of Wish
// Jar made while PHOTO_RELAY_URL was the relay's workers.dev address (WJ-41,
// before WJ-42 moved it to blastin.dev on 2026-10-17). They only knew the
// photo codes, and the phone opens the address the device called. Everything
// else there is a 404. No family jar was ever reached through it (JAR_URL
// came after WJ-42), so no photo URL kept in a jar starts with it.
//
// Retire it once no frame or phone build from before WJ-42 is in use: set
// `workers_dev` to false in wrangler.jsonc and drop this list and its check in
// src/index.ts.
export const WORKERS_DEV_PATHS: readonly string[] = ['/', '/s', '/s/*', '/qr/*.svg', '/codes', '/codes/*'];

// The workers.dev address, and Preview URLs if they're ever turned on
// (`preview_urls` in wrangler.jsonc).
export function isWorkersDev(url: URL): boolean {
  return url.hostname.endsWith('.workers.dev');
}

// Whether the relay serves this path, on its custom domain or passed on by
// the site (ROUTES), or on the workers.dev address (WORKERS_DEV_PATHS).
export function servedPath(url: URL): boolean {
  const paths = isWorkersDev(url) ? WORKERS_DEV_PATHS : ROUTES.map((route) => route.path);
  return paths.some((path) => wildcardMatch(path, url.pathname));
}

// The endpoints the WAF rate limiting rule counts (README.md, "The rate
// limiting rule"): the ones that need no token, and the live socket, which
// wakes a family's jar. Matched exactly, so a device polling
// /codes/:code/photo isn't counted. The Free plan's rule counts by IP only,
// over 10 seconds, and blocks for 10.
export const RATE_LIMITED_PATHS: readonly string[] = [
  '/families',
  '/codes',
  '/devices/codes',
  '/devices/join',
  '/devices/echo-show',
  '/jar/live',
];
export const RATE_LIMIT = { requests: 10, periodSeconds: 10, blockSeconds: 10 } as const;

// The rate limiting rule's expression. The Free plan's can only use the path.
export function rateLimitExpression(): string {
  return `(http.request.uri.path in {${RATE_LIMITED_PATHS.map((path) => `"${path}"`).join(' ')}})`;
}

// The `wildcard` operator: the whole value, ignoring case.
export function wildcardMatch(pattern: string, value: string): boolean {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`, 'i').test(value);
}

// The WAF custom rule's expression for README.md: a request matching no route
// and its methods, to the relay's host, or to one of the paths the site
// passes on to it on the site's host.
export function blockExpression(relayHost: string, siteHost: string): string {
  const served = ROUTES.map(({ path, methods }) => {
    const where = path.includes('*') ? `http.request.uri.path wildcard "${path}"` : `http.request.uri.path eq "${path}"`;
    return `(${where} and http.request.method in {${methods.map((method) => `"${method}"`).join(' ')}})`;
  });
  const forwarded = SITE_FORWARDED_PATHS.map((path) => `http.request.uri.path wildcard "${path}"`);
  const relayPaths = [`http.host eq "${relayHost}"`, ...forwarded].join(' or ');
  return `(http.host in {"${relayHost}" "${siteHost}"} and (${relayPaths}) and not (${served.join(' or ')}))`;
}
