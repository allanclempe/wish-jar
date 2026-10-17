import { onEchoShow } from './host';

// The Echo Show's Alexa device id, which keys its database backup on the relay
// (WJ-45). The page can't read it itself: the skill's LaunchRequest handler
// puts `context.System.device.deviceId` in the `data` of its
// Alexa.Presentation.HTML.Start directive, which reaches the page as the
// `message` of Alexa.create().
//
// Alexa.create may run once per page, so the id is also kept in
// sessionStorage for reloads within the skill session.
const ALEXA_SCRIPT = 'https://cdn.html.games.alexa.a2z.com/alexa-html/latest/alexa-html.js';
const DEVICE_ID_KEY = 'wish-jar:alexa-device-id';
const START_TIMEOUT_MS = 15_000;

type AlexaStart = { alexa: unknown; message?: unknown };
type AlexaGlobal = { create(options: { version: string }): Promise<AlexaStart> };

let deviceIdPromise: Promise<string | null> | null = null;

// Null off the Echo Show, or when the skill sends no device id (an older
// launch handler). Rejects when Alexa doesn't answer.
export function getAlexaDeviceId(): Promise<string | null> {
  if (!onEchoShow) return Promise.resolve(null);
  deviceIdPromise ??= readDeviceId().catch((error: unknown) => {
    // Let a retry ask again.
    deviceIdPromise = null;
    throw error;
  });
  return deviceIdPromise;
}

async function readDeviceId(): Promise<string | null> {
  const saved = readSaved();
  if (saved) return saved;

  const { message } = await withTimeout(startAlexa(), START_TIMEOUT_MS);
  const deviceId =
    message != null && typeof message === 'object' && 'deviceId' in message
      ? message.deviceId
      : null;
  if (typeof deviceId !== 'string' || !deviceId) return null;
  try {
    sessionStorage.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    // Without sessionStorage a reload asks Alexa again.
  }
  return deviceId;
}

function readSaved(): string | null {
  try {
    return sessionStorage.getItem(DEVICE_ID_KEY);
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
