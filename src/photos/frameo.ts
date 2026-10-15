import { Platform } from 'react-native';

// On the Frameo photo frame, Wish Jar runs inside the frame app (frame/), which
// marks its user agent and serves the photos sent to the frame with the Frameo
// phone app under /frameo/photos. Grown-ups pick a kid's or an icon's photo
// from those, since the frame has no gallery of its own.
export const onFrame =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  / WishJarFrame$/.test(navigator.userAgent);

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

// The photo upright, cropped square and scaled to `size` px by the frame app.
export function frameoPhotoUri(photo: FrameoPhoto, size: number): string {
  return `/frameo/photos/${encodeURIComponent(photo.name)}?size=${Math.round(size)}`;
}
