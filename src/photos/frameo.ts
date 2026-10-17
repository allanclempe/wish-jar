import { Platform } from 'react-native';

// The frame app (frame/) adds its own settings to every page, as
// window.wishJarFrame (frame/build.sh writes them). With frameoPhotos, the frame
// app serves the photos sent to the frame with the Frameo phone app under
// /frameo/photos, and grown-ups pick a kid's or an icon's photo from those,
// since the frame has no gallery of its own. Everywhere else (phones, the dev
// server, a frame built with FRAMEO_PHOTOS=0) photos are picked the usual way.
// It's a page setting rather than an EXPO_PUBLIC_ variable so that every build
// shares one bundle: Metro caches inlined variables across builds.
export const frameoPhotos =
  Platform.OS === 'web' &&
  (globalThis as { wishJarFrame?: { frameoPhotos?: boolean } }).wishJarFrame?.frameoPhotos === true;

export type FrameoPhoto = { name: string; time: number };

export type FrameoPhotos =
  | { status: 'ok'; photos: FrameoPhoto[] }
  // Wish Jar isn't allowed to read the frame's storage (yet).
  | { status: 'permission' };

// Newest first. With `ask`, the frame also asks for permission when it has none.
export async function listFrameoPhotos(ask: boolean): Promise<FrameoPhotos> {
  const response = await fetch(ask ? '/frameo/photos?ask=1' : '/frameo/photos');
  if (response.status === 403) return { status: 'permission' };
  if (!response.ok) throw new Error(`Frameo photos: HTTP ${response.status}`);
  return { status: 'ok', photos: await response.json() };
}

// Opens Frameo, where Add friend gives the code a phone's Frameo app needs. The
// frame app brings Wish Jar back once a new photo arrives, or after 5 minutes
// (frame/src/com/wishjar/frame/ReturnReceiver.java).
export async function connectPhone(): Promise<void> {
  await fetch('/frameo/connect', { method: 'POST' });
}

// The photo upright, cropped square and scaled to `size` px by the frame app.
export function frameoPhotoUri(photo: FrameoPhoto, size: number): string {
  return `/frameo/photos/${encodeURIComponent(photo.name)}?size=${Math.round(size)}`;
}

// The photo upright, scaled by the frame app to fill `width` x `height` px and
// cropped to it from the middle.
export function frameoSlideUri(photo: FrameoPhoto, width: number, height: number): string {
  return `/frameo/photos/${encodeURIComponent(photo.name)}?width=${Math.round(width)}&height=${Math.round(height)}&fit=cover`;
}
