// expo-file-system is not available on web, so kid photos are stored as
// data URIs directly in the database instead of as files on disk.

export async function storePhoto(sourceUri: string): Promise<string> {
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
