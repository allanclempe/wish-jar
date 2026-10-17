import { createHmac, timingSafeEqual } from 'node:crypto';

// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// Device tokens and photo URLs carry the relay's signature (WJ-55), so a
// made-up one is turned away by the Worker without waking a family's jar:
// each wake counts against the Free plan's daily requests, shared by every
// family. The signature is an HMAC with SIGNING_KEY, a Worker secret
// (relay/README.md). It only says the relay made the token or URL; the jar
// still checks a token's secret, and a photo's id is still what finds it.
//
// node:crypto's HMAC (on with this compatibility date), as the jar signs the
// URLs of photos it moves inside its synchronous transactions.

// Tokens and photo URLs from before the signatures keep working until then,
// so every device has time to get a signed token (POST /devices/token) and
// every jar to sign the photo URLs it keeps. 60 days after WJ-55 was merged.
export const UNSIGNED_UNTIL = Date.UTC(2026, 11, 17);

export function unsignedAllowed(now = Date.now()): boolean {
  return now < UNSIGNED_UNTIL;
}

// What the signature is over, with what it's for in front, so a token's
// signature can't pass as a photo's.
function sign(key: string, message: string): string {
  return createHmac('sha256', key).update(message).digest('base64url');
}

function sameSignature(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

// A device token's signature: over the family id and the device's id (its
// row in the family's jar).
export function deviceSignature(env: Env, familyId: string, deviceId: number): string {
  return sign(env.SIGNING_KEY, `wish-jar-device:${familyId}.${deviceId}`);
}

export function deviceSignatureOk(env: Env, familyId: string, deviceId: number, signature: string): boolean {
  return sameSignature(deviceSignature(env, familyId, deviceId), signature);
}

// A photo URL's signature: over the family id and the photo's id.
export function photoSignature(env: Env, familyId: string, photoId: string): string {
  return sign(env.SIGNING_KEY, `wish-jar-photo:${familyId}/${photoId}`);
}

export function photoSignatureOk(env: Env, familyId: string, photoId: string, signature: string): boolean {
  return sameSignature(photoSignature(env, familyId, photoId), signature);
}
