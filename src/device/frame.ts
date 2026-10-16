import { Platform } from 'react-native';

// Inside the frame app (frame/), which adds window.wishJarFrame to every page.
// Phones and the dev server follow their own OS settings instead.
export const onFrame =
  Platform.OS === 'web' && (globalThis as { wishJarFrame?: object }).wishJarFrame != null;

// The device's timezone, e.g. "Australia/Brisbane". The frame app sets it from
// the frame's IP address until one is set, and the page's clock follows any
// change at once (frame/src/com/wishjar/frame/FrameTimeZone.java).
export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Every timezone the browser knows, by IANA id.
export function timeZones(): string[] {
  return Intl.supportedValuesOf('timeZone');
}

// "GMT+10" for Australia/Brisbane, at the moment.
export function timeZoneOffset(zone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

// "Australia/Brisbane" reads as "Brisbane, Australia".
export function timeZoneName(zone: string): string {
  const [region, ...place] = zone.split('/');
  return place.length === 0
    ? region.replace(/_/g, ' ')
    : `${place.reverse().join(', ').replace(/_/g, ' ')}, ${region}`;
}

// Asks the frame app to set the frame's timezone. Throws when it couldn't.
export async function setFrameTimeZone(zone: string): Promise<void> {
  const response = await fetch(`/device/timezone?zone=${encodeURIComponent(zone)}`, { method: 'POST' });
  if (!response.ok) throw new Error(`Timezone: HTTP ${response.status}`);
}
