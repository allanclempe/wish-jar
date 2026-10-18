import { Platform } from 'react-native';

import { onEchoShow, onFrame } from './host';

// The browser's system by its user agent, first match wins. iPads ask for the
// desktop site, so one reads as a Mac (see browserSystem).
const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Macintosh/, 'Mac'],
  [/Windows/, 'Windows'],
];

// How the family's list of devices shows this one (WJ-48), given when it
// starts or joins the family: "Frameo frame", "iPhone", "Browser on Android".
export function deviceLabel(): string {
  if (onFrame) return 'Frameo frame';
  if (onEchoShow) return 'Echo Show';
  if (Platform.OS === 'ios') return Platform.isPad ? 'iPad' : 'iPhone';
  if (Platform.OS === 'android') return 'Android';
  const system = browserSystem();
  return system ? `Browser on ${system}` : 'Browser';
}

function browserSystem(): string | null {
  if (typeof navigator === 'undefined') return null;
  const system = SYSTEMS.find(([pattern]) => pattern.test(navigator.userAgent))?.[1] ?? null;
  return system === 'Mac' && navigator.maxTouchPoints > 1 ? 'iPad' : system;
}
