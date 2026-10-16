import { Directory, File, Paths } from 'expo-file-system';

import { shrinkPhoto } from './shrink';

const photoDirectory = new Directory(Paths.document, 'photos');

// Copies the photo into the app's own photos directory, scaled down first when
// it is bigger than a photo card needs (src/photos/shrink.ts).
export async function storePhoto(sourceUri: string): Promise<string> {
  photoDirectory.create({ intermediates: true, idempotent: true });
  const destination = new File(
    photoDirectory,
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
  );
  const shrunk = await shrinkPhoto(sourceUri);
  const source = new File(shrunk?.uri ?? sourceUri);
  if (shrunk) {
    source.move(destination);
  } else {
    await source.copy(destination);
  }
  return destination.uri;
}

export function removePhoto(photoUri: string | null): void {
  if (!photoUri) return;
  const file = new File(photoUri);
  if (file.info().exists) {
    file.delete();
  }
}
