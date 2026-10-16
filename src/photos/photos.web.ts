// expo-file-system is not available on web, so kid photos are stored as
// data URIs directly in the database instead of as files on disk.

import { shrinkPhoto } from './shrink';

export async function storePhoto(sourceUri: string): Promise<string> {
  // Scaled down first when it is bigger than a photo card needs
  // (src/photos/shrink.ts); the frame's own 512 px Frameo photos stay as they are.
  const shrunk = await shrinkPhoto(sourceUri, true);
  if (shrunk?.base64) {
    return `data:image/jpeg;base64,${shrunk.base64}`;
  }
  if (sourceUri.startsWith('data:')) {
    return sourceUri;
  }
  const response = await fetch(sourceUri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function removePhoto(_photoUri: string | null): void {
  // Nothing to clean up — the photo lives in the database row.
}
