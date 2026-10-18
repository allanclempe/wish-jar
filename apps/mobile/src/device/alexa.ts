import { onEchoShow } from './host';

// The Echo Show's Alexa device id, which links the Show to its family jar in
// the API (WJ-45): its storage is wiped at the end of every skill session,
// so it can't keep a token, and gets a new one with this id at every launch
// (src/db/open.ts). The page can't read the id itself: the skill's
// LaunchRequest handler puts `Alexa.getDeviceId(requestEnvelope)` in the
// `data` of its Alexa.Presentation.HTML.Start directive, as `{ deviceId }`,
// which reaches the page as the `message` of Alexa.create().
//
// Along with it, `secret` (WJ-60): a random secret the skill keeps for this
// Show, which proves to the API that it's this Show and not something else
// that learnt its id. apps/api/README.md has the skill's handler.
//
// Alexa.create may run once per page, so both are also kept in sessionStorage
// for reloads within the skill session.
const ALEXA_SCRIPT = 'https://cdn.html.games.alexa.a2z.com/alexa-html/latest/alexa-html.js';
const DEVICE_ID_KEY = 'wish-jar:alexa-device-id';
const SECRET_KEY = 'wish-jar:alexa-secret';
const START_TIMEOUT_MS = 15_000;

type AlexaStart = { alexa: unknown; message?: unknown };
type AlexaGlobal = { create(options: { version: string }): Promise<AlexaStart> };

// `secret` is null when the skill sends none (a launch handler from before
// WJ-60).
export type AlexaLaunch = { deviceId: string; secret: string | null };

let launchPromise: Promise<AlexaLaunch | null> | null = null;

// Null off the Echo Show, or when the skill sends no device id (a launch
// handler from before WJ-45). Rejects when Alexa doesn't answer.
export function getAlexaLaunch(): Promise<AlexaLaunch | null> {
  if (!onEchoShow) return Promise.resolve(null);
  launchPromise ??= readLaunch().catch((error: unknown) => {
    // Let a retry ask again.
    launchPromise = null;
    throw error;
  });
  return launchPromise;
}

async function readLaunch(): Promise<AlexaLaunch | null> {
  const saved = readSaved();
  if (saved) return saved;

  const { message } = await withTimeout(startAlexa(), START_TIMEOUT_MS);
  const { deviceId, secret } =
    message != null && typeof message === 'object' ? (message as Record<string, unknown>) : {};
  if (typeof deviceId !== 'string' || !deviceId) return null;
  const launch = { deviceId, secret: typeof secret === 'string' && secret ? secret : null };
  try {
    sessionStorage.setItem(DEVICE_ID_KEY, launch.deviceId);
    if (launch.secret) sessionStorage.setItem(SECRET_KEY, launch.secret);
  } catch {
    // Without sessionStorage a reload asks Alexa again.
  }
  return launch;
}

function readSaved(): AlexaLaunch | null {
  try {
    const deviceId = sessionStorage.getItem(DEVICE_ID_KEY);
    return deviceId ? { deviceId, secret: sessionStorage.getItem(SECRET_KEY) } : null;
  } catch {
    return null;
  }
}

async function startAlexa(): Promise<AlexaStart> {
  const global = window as unknown as { Alexa?: AlexaGlobal };
  if (!global.Alexa) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = ALEXA_SCRIPT;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the Alexa HTML API'));
      document.head.appendChild(script);
    });
  }
  if (!global.Alexa) throw new Error('The Alexa HTML API did not load');
  return global.Alexa.create({ version: '1.1' });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Alexa did not answer')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
