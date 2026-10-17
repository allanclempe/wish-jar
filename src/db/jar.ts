import { fetch as expoFetch } from 'expo/fetch';

import type {
  CreateFamilyReply,
  CreateFamilyRequest,
  EchoShowRequest,
  JarApi,
  JarFn,
  JarImport,
  JoinRequest,
  PhotoUpload,
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
// A photo of a few hundred KB, on a frame's slow Wi-Fi.
const UPLOAD_TIMEOUT_MS = 60_000;

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

  // The relay doesn't know this device's token: it was removed from its
  // family (WJ-48), or the family is gone. There's no recovery (WJ-47), only
  // joining a family again.
  get unknownDevice(): boolean {
    return this.status === 401;
  }
}

type Method = 'GET' | 'POST' | 'DELETE';

// The handle every src/db function takes first, in place of the SQLite
// database it used to.
export type FamilyJar = {
  call<F extends JarFn>(fn: F, ...args: JarApi[F]['args']): Promise<JarApi[F]['result']>;
  // The relay's other endpoints for a device of the family, such as its
  // devices (devices.ts). GET reads; the rest wait their turn like writes.
  send<T>(method: Method, path: string): Promise<T>;
  // Puts a JPEG in the family jar (WJ-49); its URL.
  upload(jpeg: Uint8Array<ArrayBuffer>): Promise<string>;
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

  function queued<T>(read: boolean, send: () => Promise<T>): Promise<T> {
    const reply = writes.then(send);
    if (!read) writes = reply.catch(() => {});
    return reply.catch((error: unknown) => {
      const failure = error instanceof JarCallError ? error : new JarCallError(String(error), null);
      if (failure.lost || failure.unknownDevice) onProblem?.({ error: failure, write: !read });
      throw failure;
    });
  }

  return {
    call(fn, ...args) {
      return queued(isRead(fn), () =>
        request<{ result: never }>('POST', '/jar/call', { fn, args }, CALL_TIMEOUT_MS, token),
      ).then((body) => body.result);
    },
    send(method, path) {
      return queued(method === 'GET', () => request(method, path, undefined, CALL_TIMEOUT_MS, token));
    },
    upload(jpeg) {
      // Not behind the writes: nothing shows the photo until a write saves it.
      return queued(true, () => uploadJpeg(jpeg, token)).then((body) => body.url);
    },
  };
}

// A new family, with this device as its first. With `jar`, the family starts
// from this device's existing jar instead of an empty one. `label` is how the
// family's list of devices shows this one.
export function createFamily(label: string, jar?: JarImport): Promise<CreateFamilyReply> {
  const body: CreateFamilyRequest = jar ? { label, jar } : { label };
  return request('POST', '/families', body, CREATE_TIMEOUT_MS);
}

// A token of this device's own to the family whose join code was typed
// (WJ-48). The code works once.
export function joinFamily(code: string, label: string): Promise<CreateFamilyReply> {
  const body: JoinRequest = { code, label };
  return request('POST', '/devices/join', body, CALL_TIMEOUT_MS);
}

// A new token for this Echo Show's place in its family (WJ-45), or null when
// the relay doesn't have the Show in one: it never linked, or a parent removed
// it. Only a relay that can't be reached throws.
export async function rejoinEchoShow(alexaDeviceId: string): Promise<CreateFamilyReply | null> {
  const body: EchoShowRequest = { alexaDeviceId };
  try {
    return await request<CreateFamilyReply>('POST', '/devices/echo-show', body, CALL_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof JarCallError && error.status === 404) return null;
    throw error;
  }
}

// Lets this Echo Show, now a device of the family `token` opens, rejoin it at
// its next launches.
export async function linkEchoShow(token: string, alexaDeviceId: string): Promise<void> {
  const body: EchoShowRequest = { alexaDeviceId };
  await request('POST', '/devices/echo-show/link', body, CALL_TIMEOUT_MS, token);
}

// expo/fetch on phones, which sends bytes as they are; the browser's own fetch
// on the web.
async function uploadJpeg(jpeg: Uint8Array<ArrayBuffer>, token: string): Promise<PhotoUpload> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    let response;
    try {
      response = await expoFetch(`${JAR_URL}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${token}` },
        body: jpeg,
        signal: controller.signal,
      });
    } catch (error) {
      throw new JarCallError(`Family jar: ${String(error)}`, null);
    }
    if (!response.ok) {
      const reason = await response.text().catch(() => '');
      throw new JarCallError(reason || `Family jar: HTTP ${response.status}`, response.status);
    }
    return (await response.json()) as PhotoUpload;
  } finally {
    clearTimeout(timer);
  }
}

// Replies with no content (204) come back as null.
async function request<T>(
  method: Method,
  path: string,
  body: unknown,
  timeoutMs: number,
  token?: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${JAR_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  if (response.status === 204) return null as T;
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new JarCallError(`Family jar: ${String(error)}`, null);
  }
}
