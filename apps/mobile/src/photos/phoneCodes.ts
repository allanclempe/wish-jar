import { API_ADDRESS } from '../apiUrl';

// A photo from a parent's phone, carried to this device by the API: Wish Jar
// asks it for a short-lived code, shows the code as a QR code, and collects
// the photo once the phone sends it.

export type PhoneCode = {
  // Short, for typing on the phone: 6 letters and digits.
  code: string;
  // The secret that proves it's this device collecting the photo.
  token: string;
  expiresAt: number;
  // The page the phone opens (what the QR code holds).
  url: string;
};

// The API asked to wait before another code (WJ-51): too many from this
// internet connection. `retryAfter` is the seconds it said, if it did.
export class TooManyCodes extends Error {
  constructor(readonly retryAfter: number | null) {
    super('Phone photo: too many codes');
    this.name = 'TooManyCodes';
  }
}

export async function createPhoneCode(): Promise<PhoneCode> {
  const response = await fetch(`${API_ADDRESS}/codes`, { method: 'POST' });
  if (response.status === 429) {
    const wait = Number(response.headers.get('Retry-After'));
    throw new TooManyCodes(Number.isFinite(wait) && wait > 0 ? wait : null);
  }
  if (!response.ok) throw new Error(`Phone photo: HTTP ${response.status}`);
  return response.json();
}

// The QR code for the phone's page, as an SVG drawn by the API.
export function phoneCodeQrUri(code: string): string {
  return `${API_ADDRESS}/qr/${code}.svg`;
}

// The photo as a data URI once the phone has sent it (the API hands it over
// only once), 'waiting' until then, or 'expired' when the code has run out.
export async function collectPhonePhoto(
  { code, token }: PhoneCode,
): Promise<string | 'waiting' | 'expired'> {
  const response = await fetch(`${API_ADDRESS}/codes/${code}/photo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 204) return 'waiting';
  if (response.status === 410) return 'expired';
  if (!response.ok) throw new Error(`Phone photo: HTTP ${response.status}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Lets the API drop a code nobody will use now. Best effort: it runs out by
// itself anyway.
export function closePhoneCode({ code, token }: PhoneCode): void {
  fetch(`${API_ADDRESS}/codes/${code}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}
