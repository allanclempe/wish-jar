// Kept out of src/index.ts: a Worker's main module may only export handlers
// and classes.

// A compressed Wish Jar database, photos included (they live in it as data
// URIs on web), is usually well under 1 MB.
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

// Alexa device ids (amzn1.ask.device.…) run to a couple of hundred
// characters. The key is the only thing guarding a backup, so a short one is
// turned away rather than stored under.
export const MIN_BACKUP_KEY_LENGTH = 32;

// The Durable Object's name: a hash, so the device's id itself is never kept.
export async function backupName(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`wish-jar-backup:${key}`),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
