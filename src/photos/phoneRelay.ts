// The photo relay (relay/), a Cloudflare Worker that carries one photo from a
// parent's phone to this device: Wish Jar asks it for a short-lived code, shows
// the code as a QR code, and collects the photo once the phone sends it.
//
// PLACEHOLDER: set to the Worker's address once it's deployed on Allan's
// Cloudflare account (`pnpm run deploy` in relay/ prints it). Until then asking
// for a code fails, and the phone sheet says it can't reach the relay.
export const PHOTO_RELAY_URL = 'https://wish-jar-photo-relay.<subdomain>.workers.dev';

export type RelayCode = {
  // Short, for typing on the phone: 6 letters and digits.
  code: string;
  // The secret that proves it's this device collecting the photo.
  token: string;
  expiresAt: number;
  // The page the phone opens (what the QR code holds).
  url: string;
};

export async function createRelayCode(): Promise<RelayCode> {
  const response = await fetch(`${PHOTO_RELAY_URL}/codes`, { method: 'POST' });
  if (!response.ok) throw new Error(`Photo relay: HTTP ${response.status}`);
  return response.json();
}

// The QR code for the phone's page, as an SVG drawn by the relay.
export function relayQrUri(code: string): string {
  return `${PHOTO_RELAY_URL}/qr/${code}.svg`;
}

// The photo as a data URI once the phone has sent it (the relay hands it over
// only once), 'waiting' until then, or 'expired' when the code has run out.
export async function collectRelayPhoto(
  { code, token }: RelayCode,
): Promise<string | 'waiting' | 'expired'> {
  const response = await fetch(`${PHOTO_RELAY_URL}/codes/${code}/photo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 204) return 'waiting';
  if (response.status === 410) return 'expired';
  if (!response.ok) throw new Error(`Photo relay: HTTP ${response.status}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Lets the relay drop a code nobody will use now. Best effort: it runs out by
// itself anyway.
export function closeRelayCode({ code, token }: RelayCode): void {
  fetch(`${PHOTO_RELAY_URL}/codes/${code}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}
