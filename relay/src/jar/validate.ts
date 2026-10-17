import type { Icon, Period } from './api';
import {
  MAX_COINS,
  MAX_EMOJI_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PHOTO_URI_LENGTH,
} from './limits';

// Any device holding a token can send anything, so every argument is checked
// before it gets near the jar. The message goes back with the 400.
export type JarErrorStatus = 400 | 401 | 404 | 409 | 410 | 507;

export class JarError extends Error {
  constructor(
    readonly status: JarErrorStatus,
    message: string,
  ) {
    super(message);
  }
}

export function bad(message: string): never {
  throw new JarError(400, message);
}

export function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    bad(`${what} should be an object`);
  }
  return value as Record<string, unknown>;
}

// Positive, and small enough to be exact in JSON.
export function id(value: unknown, what = 'id'): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) bad(`${what} should be a positive whole number`);
  return value as number;
}

export function integer(value: unknown, what: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    bad(`${what} should be a whole number from ${min} to ${max}`);
  }
  return value as number;
}

export function coins(value: unknown, what = 'coinAmount'): number {
  return integer(value, what, 0, MAX_COINS);
}

export function boolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') bad(`${what} should be true or false`);
  return value;
}

function text(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string') bad(`${what} should be text`);
  if (value.length > max) bad(`${what} is too long`);
  return value;
}

function nullableText(value: unknown, what: string, max: number): string | null {
  return value === null ? null : text(value, what, max);
}

// Trimmed like the app does, and never empty.
export function name(value: unknown, what = 'name'): string {
  const trimmed = text(value, what, MAX_NAME_LENGTH).trim();
  if (!trimmed) bad(`${what} is empty`);
  return trimmed;
}

export function label(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return text(value, 'label', MAX_LABEL_LENGTH).trim() || null;
}

export function photoUri(value: unknown, what = 'photoUri'): string | null {
  return nullableText(value, what, MAX_PHOTO_URI_LENGTH);
}

export function emoji(value: unknown, what = 'emoji'): string | null {
  return nullableText(value, what, MAX_EMOJI_LENGTH);
}

export function icon(value: unknown): Icon {
  const input = record(value, 'icon');
  return { emoji: emoji(input.emoji, 'icon.emoji'), photoUri: photoUri(input.photoUri, 'icon.photoUri') };
}

export function period(value: unknown): Period {
  if (value !== 'morning' && value !== 'afternoon' && value !== 'evening') {
    bad('period should be morning, afternoon or evening');
  }
  return value;
}

// The device's calendar day, as src/tasks/day.ts writes it.
export function dayKey(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    bad('dayKey should look like 2026-10-17');
  }
  return value;
}

export function pin(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{3}$/.test(value)) bad('pin should be 3 digits');
  return value;
}

// A millisecond timestamp.
export function time(value: unknown, what: string): number {
  return integer(value, what, 0, 8.64e15);
}
