import { File } from 'expo-file-system';

import { listConsequenceTypes } from '../db/consequenceTypes';
import type { FamilyJar } from '../db/jar';
import { listKids } from '../db/kids';
import { discardPhoto, replacePhoto, uploadPhoto } from '../db/photos';
import { listTasks } from '../db/tasks';
import { listWishes } from '../db/wishes';
import { shrinkPhoto } from './shrink';

// Puts the photo in the family jar (WJ-49), scaled down first when it is
// bigger than a photo card needs (src/photos/shrink.ts); its URL, the same on
// every device of the family.
export async function storePhoto(jar: FamilyJar, sourceUri: string): Promise<string> {
  const shrunk = new File((await shrinkPhoto(sourceUri)).uri);
  try {
    return await uploadPhoto(jar, await shrunk.bytes());
  } finally {
    if (shrunk.exists) shrunk.delete();
  }
}

// The photo to show, or null for the fallback emoji. Before WJ-49 a phone
// kept its photos as files of its own: only that phone can show them, until
// it has put them in the jar (moveLocalPhotosOnline).
export function shownPhoto(photoUri: string | null): string | null {
  if (!photoUri?.startsWith('file:')) return photoUri;
  return new File(photoUri).exists ? photoUri : null;
}

// Puts the photos this phone kept as files before WJ-49 in the family jar,
// and points everything that shows them at the jar's copy. The files stay
// where they are: the jar this phone kept before WJ-47 (src/db/localJar.ts)
// still names them. Run at every launch until none are left; one that fails
// is tried again next time.
export async function moveLocalPhotosOnline(jar: FamilyJar): Promise<void> {
  const [kids, tasks, wishes, types] = await Promise.all([
    listKids(jar),
    listTasks(jar),
    listWishes(jar),
    listConsequenceTypes(jar),
  ]);
  const uris = new Set([
    ...kids.map((kid) => kid.photoUri),
    ...[...tasks, ...wishes, ...types].map((item) => item.icon.photoUri),
  ]);
  for (const uri of uris) {
    // Another phone's files can't be read here: that phone moves them.
    if (!uri?.startsWith('file:') || !new File(uri).exists) continue;
    const url = await storePhoto(jar, uri);
    if ((await replacePhoto(jar, uri, url)) === 0) discardPhoto(jar, url);
  }
}
