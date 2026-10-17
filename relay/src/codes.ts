// Kept out of src/index.ts: a Worker's main module may only export handlers
// and classes.

// Typed from the QR code's link or by hand: no 0/O, 1/I/L to mix up.
export const CODE_LETTERS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60_000;
// The phone sends a 512 px JPEG, usually well under 100 KB.
export const MAX_PHOTO_BYTES = 300 * 1024;

// Upper case without spaces or dashes ("k7p 4xm", or "k7p%204xm" in a path, →
// "K7P4XM"), or null when it can't be a code.
export function normaliseCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/%20|[\s-]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((letter) => CODE_LETTERS.includes(letter)) ? code : null;
}

export function randomCode(): string {
  // Bytes past the last whole run of letters are dropped, so every letter is
  // equally likely.
  const runs = Math.floor(256 / CODE_LETTERS.length) * CODE_LETTERS.length;
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(CODE_LENGTH))) {
      if (byte < runs && code.length < CODE_LENGTH) code += CODE_LETTERS[byte % CODE_LETTERS.length];
    }
  }
  return code;
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
