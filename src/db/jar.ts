import type {
  CreateFamilyReply,
  CreateFamilyRequest,
  JarApi,
  JarFn,
  JarImport,
} from '../../relay/src/jar/api';
import { PHOTO_RELAY_URL } from '../photos/phoneRelay';

export type { JarImport };

// The family's jar lives in the relay (relay/src/FamilyJar.ts), shared by the
// family's devices. EXPO_PUBLIC_JAR_URL points a dev build at another relay,
// such as `pnpm dev` in relay/ (http://localhost:8787).
export const JAR_URL = process.env.EXPO_PUBLIC_JAR_URL || PHOTO_RELAY_URL;

// A frame that has just woken up may take a while to get its Wi-Fi back; past
// this a call counts as lost rather than hanging the screen.
const CALL_TIMEOUT_MS = 15_000;
// A whole jar going up, photos and all, on the first launch.
const CREATE_TIMEOUT_MS = 60_000;

// A call the jar didn't answer. `status` is the relay's HTTP status, or null
// when the relay couldn't be reached at all.
export class JarCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'JarCallError';
  }

  // The connection, not the call, is at fault: the same call will do once the
  // relay is back.
  get lost(): boolean {
    return this.status === null || this.status === 429 || this.status >= 500;
  }

  // The relay doesn't know this device's token. There's no recovery (WJ-47):
  // the jar is gone for this device.
  get unknownDevice(): boolean {
    return this.status === 401;
  }
}

// The handle every src/db function takes first, in place of the SQLite
// database it used to.
export type FamilyJar = {
  call<F extends JarFn>(fn: F, ...args: JarApi[F]['args']): Promise<JarApi[F]['result']>;
};

// What went wrong on a call, so the app can show the reconnecting screen.
// `write` says a change may not have been saved.
export type JarProblem = { error: JarCallError; write: boolean };

// Reads don't change the jar, so they may run side by side.
function isRead(fn: JarFn): boolean {
  return /^(list|get|sum)/.test(fn);
}

export function createJarClient(token: string, onProblem?: (problem: JarProblem) => void): FamilyJar {
  // The jar runs one call at a time, but two requests in flight can still
  // reach it in either order: a tick and its quick un-tick must land in the
  // order they were tapped. So writes go one after another, and a read waits
  // for the writes before it, to see them.
  let writes: Promise<unknown> = Promise.resolve();

  return {
    call(fn, ...args) {
      const send = () => post<{ result: never }>('/jar/call', { fn, args }, CALL_TIMEOUT_MS, token);
      const reply = writes.then(send);
      if (!isRead(fn)) writes = reply.catch(() => {});
      return reply.then(
        (body) => body.result,
        (error: unknown) => {
          const failure = error instanceof JarCallError ? error : new JarCallError(String(error), null);
          if (failure.lost || failure.unknownDevice) onProblem?.({ error: failure, write: !isRead(fn) });
          throw failure;
        },
      );
    },
  };
}

// A new family, with this device as its first. With `jar`, the family starts
// from this device's existing jar instead of an empty one.
export function createFamily(jar?: JarImport): Promise<CreateFamilyReply> {
  const request: CreateFamilyRequest = jar ? { jar } : {};
  return post('/families', request, CREATE_TIMEOUT_MS);
}

async function post<T>(path: string, body: unknown, timeoutMs: number, token?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${JAR_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new JarCallError(`Family jar: ${String(error)}`, null);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    // The relay says why in plain text ("The jar is full: delete something first").
    const reason = await response.text().catch(() => '');
    throw new JarCallError(reason || `Family jar: HTTP ${response.status}`, response.status);
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new JarCallError(`Family jar: ${String(error)}`, null);
  }
}
