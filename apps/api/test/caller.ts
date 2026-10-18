import { DUMMY_TOKEN } from './turnstileKeys';

// A request from an address of its own unless it names one, so the
// per-caller limits (src/CallerLimits.ts) only meet the tests about them. A
// new family also passes the Turnstile check (WJ-54) unless the request has a
// Turnstile-Token of its own, for the tests about that.
let lastCaller = 0;

export function fromSomewhere(request: Request): Request {
  if (!request.headers.has('CF-Connecting-IP')) {
    lastCaller += 1;
    request.headers.set('CF-Connecting-IP', `10.${(lastCaller >> 16) & 255}.${(lastCaller >> 8) & 255}.${lastCaller & 255}`);
  }
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/families' && !request.headers.has('Turnstile-Token')) {
    request.headers.set('Turnstile-Token', DUMMY_TOKEN);
  }
  return request;
}
