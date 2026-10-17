import { DurableObject } from 'cloudflare:workers';

// What one caller (by IP address) may do on the endpoints that need no token,
// or that anyone gets a token for by starting a family (WJ-51). Every family
// shares the one Free account (100k requests and 100k rows written a day,
// 5 GB of storage), so a script must not be able to use it up. A family on
// one home connection, with several devices and a parent adding photos in a
// burst, never gets near these. The edge rule in relay/README.md turns away
// fast floods before they reach the Worker.
//
// `kept` says where the count lives. 'storage' outlives the object being put
// to sleep, for the rare things a slow script could still pile up (a new
// family a few minutes apart is 10 MB a time); each one counted is a row
// written. 'memory' costs no writes, for the frequent ones: a caller fast
// enough to matter keeps the object awake.
export const CALLER_LIMITS = {
  // POST /families. A family starts once; a few more for a try that failed
  // halfway, or families behind one mobile network's address.
  families: { max: 5, windowMs: 24 * 60 * 60_000, kept: 'storage' },
  // POST /codes, a code per photo from a phone.
  photoCodes: { max: 30, windowMs: 60 * 60_000, kept: 'storage' },
  // POST /s/:code/photo, the phone sending it.
  phonePhotos: { max: 30, windowMs: 60 * 60_000, kept: 'storage' },
  // POST /devices/codes, a code per device added.
  joinCodes: { max: 20, windowMs: 60 * 60_000, kept: 'storage' },
  // POST /devices/join, right or wrong (wrong ones have a tighter limit of
  // their own: JoinAttempts).
  joins: { max: 20, windowMs: 60 * 60_000, kept: 'storage' },
  // POST /devices/token with a token from before WJ-55, past the cut-off:
  // once per device.
  tokenSwaps: { max: 20, windowMs: 60 * 60_000, kept: 'storage' },
  // POST /devices/echo-show, at every launch of the skill on every Show.
  echoShows: { max: 60, windowMs: 60 * 60_000, kept: 'storage' },
  // POST /photos. A new family puts up the 7 starter photos at once, and a
  // phone from before WJ-49 all of its photos.
  uploads: { max: 120, windowMs: 60 * 60_000, kept: 'storage' },
  // GET /jar/live. Each device reconnects with backoff from 1 s to a minute,
  // and at once when it comes back to the front or online.
  live: { max: 120, windowMs: 10 * 60_000, kept: 'memory' },
} as const satisfies Record<string, { max: number; windowMs: number; kept: 'storage' | 'memory' }>;

export type CallerLimit = keyof typeof CALLER_LIMITS;

type Count = { count: number; until: number };

// One per caller (callerKey), counting what it did in each limit's window. The
// counts kept in storage go when their windows end (the alarm).
export class CallerLimits extends DurableObject<Env> {
  private counts = new Map<CallerLimit, Count>();

  // Counts one more, or how many seconds to wait when the limit is reached
  // (that one isn't counted, so waiting is all it takes).
  async take(limit: CallerLimit): Promise<number | null> {
    const { max, windowMs, kept } = CALLER_LIMITS[limit];
    const now = Date.now();
    let count = this.counts.get(limit) ?? (kept === 'storage' ? await this.ctx.storage.get<Count>(limit) : undefined);
    if (!count || now >= count.until) count = { count: 0, until: now + windowMs };
    if (count.count >= max) {
      this.counts.set(limit, count);
      return Math.max(1, Math.ceil((count.until - now) / 1000));
    }
    count = { ...count, count: count.count + 1 };
    this.counts.set(limit, count);
    if (kept === 'storage') {
      await this.ctx.storage.put<Count>(limit, count);
      // A new window: the alarm goes off once the last one has ended.
      if (count.count === 1) {
        const alarm = await this.ctx.storage.getAlarm();
        if (alarm == null || alarm < count.until) await this.ctx.storage.setAlarm(count.until);
      }
    }
    return null;
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const counts = await this.ctx.storage.list<Count>();
    let last = 0;
    for (const [limit, count] of counts) {
      if (now >= count.until) {
        await this.ctx.storage.delete(limit);
        this.counts.delete(limit as CallerLimit);
      } else {
        last = Math.max(last, count.until);
      }
    }
    if (last > 0) await this.ctx.storage.setAlarm(last);
  }
}

// Who's calling, for the per-caller limits: the IP address Cloudflare saw.
// An IPv6 home network gets a whole /64, so it counts as one caller; a script
// can't dodge the limits by moving around in it.
export function callerKey(request: Request): string {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

// Callers this Worker instance already knows are waiting, so a flood is
// turned away here without waking their object each time.
const waiting = new Map<string, number>();
const MAX_WAITING = 1000;

// Null when the caller may go on, or how many seconds it has to wait.
export async function takeLimit(request: Request, env: Env, limit: CallerLimit): Promise<number | null> {
  const caller = callerKey(request);
  const key = `${limit} ${caller}`;
  const until = waiting.get(key);
  const now = Date.now();
  if (until !== undefined) {
    if (now < until) return Math.ceil((until - now) / 1000);
    waiting.delete(key);
  }
  const wait = await env.CALLER_LIMITS.getByName(caller).take(limit);
  if (wait != null) {
    if (waiting.size >= MAX_WAITING) waiting.clear();
    waiting.set(key, now + wait * 1000);
  }
  return wait;
}

// The headers of a 429: how long to wait, readable by Wish Jar's pages too.
export function waitHeaders(seconds: number): Record<string, string> {
  return { 'Retry-After': String(seconds), 'Access-Control-Expose-Headers': 'Retry-After' };
}
