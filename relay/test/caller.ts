// A request from an address of its own unless it names one, so the
// per-caller limits (src/CallerLimits.ts) only meet the tests about them.
let lastCaller = 0;

export function fromSomewhere(request: Request): Request {
  if (!request.headers.has('CF-Connecting-IP')) {
    lastCaller += 1;
    request.headers.set('CF-Connecting-IP', `10.${(lastCaller >> 16) & 255}.${(lastCaller >> 8) & 255}.${lastCaller & 255}`);
  }
  return request;
}
