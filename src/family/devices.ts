import type { Device } from '../db';

// How the family's list shows a device: its label (src/device/label.ts), or
// something for one that joined without.
export function deviceName(device: Device): string {
  return device.label ?? 'A device';
}

export function deviceEmoji(device: Device): string {
  const label = device.label ?? '';
  if (/frame/i.test(label)) return '🖼️';
  if (/echo/i.test(label)) return '📺';
  if (/^browser/i.test(label)) return '💻';
  if (/iphone|ipad|android/i.test(label)) return '📱';
  return '📟';
}

// "just now", "5 minutes ago", "3 hours ago", "2 days ago". The relay notes a
// device's visits about every 10 minutes, so anything under that is "just now".
export function seenAgo(time: number, now = Date.now()): string {
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 10) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// "17 Oct", in the device's own order and words.
export function addedOn(time: number): string {
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
