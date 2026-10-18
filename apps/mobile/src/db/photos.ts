import { API_URL } from '../apiUrl';
import type { FamilyJar } from './jar';

// The family's photos live in its jar (WJ-49): a kid's or an icon's photo is
// the URL of one there, the same on every device. Save a photo with
// storePhoto (src/photos/photos.ts), which shrinks it and uploads it here.
//
// The jar deletes a photo itself once nothing shows it any more: when a save
// replaces it, or the kid, task, wish or consequence type is deleted. Only an
// upload that was never saved is left to the device (discardPhoto).

// Puts a JPEG in the family jar; its URL.
export function uploadPhoto(jar: FamilyJar, jpeg: Uint8Array<ArrayBuffer>): Promise<string> {
  return jar.upload(jpeg);
}

// Lets the jar drop a photo the device uploaded but couldn't save. Best effort:
// the jar sweeps up forgotten uploads after a day anyway, and keeps a photo
// that something shows after all.
export function discardPhoto(jar: FamilyJar, photoUri: string | null): void {
  if (!photoUri?.startsWith(`${API_URL}/photos/`)) return;
  jar.send('DELETE', photoUri.slice(API_URL.length)).catch(() => {});
}

// Points every kid, task, wish and consequence type showing `from` at `to`.
// How many changed; 0 when nothing shows `from` any more.
export function replacePhoto(jar: FamilyJar, from: string, to: string): Promise<number> {
  return jar.call('replacePhoto', from, to);
}
