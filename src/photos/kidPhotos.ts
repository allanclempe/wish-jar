import { Directory, File, Paths } from 'expo-file-system';

const photoDirectory = new Directory(Paths.document, 'kid-photos');

export async function storeKidPhoto(sourceUri: string): Promise<string> {
  photoDirectory.create({ intermediates: true, idempotent: true });
  const destination = new File(
    photoDirectory,
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
  );
  await new File(sourceUri).copy(destination);
  return destination.uri;
}

export function removeKidPhoto(photoUri: string | null): void {
  if (!photoUri) return;
  const file = new File(photoUri);
  if (file.info().exists) {
    file.delete();
  }
}
