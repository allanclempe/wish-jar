import type { FamilyJar } from '../db/jar';
import { uploadPhoto } from '../db/photos';
import { shrinkPhoto } from './shrink';

// Puts the photo in the family jar (WJ-49), scaled down first when it is
// bigger than a photo card needs (src/photos/shrink.ts); its URL, the same on
// every device of the family. Works for every way a photo arrives here: a
// picked file, or one sent from a phone through the API (a data: URI).
export async function storePhoto(jar: FamilyJar, sourceUri: string): Promise<string> {
  const shrunk = await shrinkPhoto(sourceUri);
  try {
    const response = await fetch(shrunk.uri);
    return await uploadPhoto(jar, new Uint8Array(await response.arrayBuffer()));
  } finally {
    if (shrunk.uri.startsWith('blob:')) URL.revokeObjectURL(shrunk.uri);
  }
}

// The photo to show, or null for the fallback emoji. A file kept on a phone
// before WJ-49 can't be shown here; that phone puts it in the jar.
export function shownPhoto(photoUri: string | null): string | null {
  return photoUri?.startsWith('file:') ? null : photoUri;
}

// Web photos were data: URIs in the jar's own rows, which the jar moves into
// its photos table by itself (apps/api/src/jar/photos.ts): nothing to do here.
export async function moveLocalPhotosOnline(_jar: FamilyJar): Promise<void> {}
