import { type Db, first, run } from './sql';

// Shared by every device in the family, as the whole jar is.
export const SETTING_KEYS = ['active_kid_id', 'parent_pin', 'sound_enabled'] as const;

// What the builds from before WJ-71 take as the PIN while none is set.
export const DEFAULT_PARENT_PIN = '000';

function getSetting(db: Db, key: (typeof SETTING_KEYS)[number]): string | null {
  return first<{ value: string }>(db, 'SELECT value FROM app_settings WHERE key = ?', key)?.value ?? null;
}

function setSetting(db: Db, key: (typeof SETTING_KEYS)[number], value: string): null {
  run(
    db,
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
  return null;
}

export function getActiveKidId(db: Db): number | null {
  const value = getSetting(db, 'active_kid_id');
  return value === null ? null : Number(value);
}

export function setActiveKidId(db: Db, kidId: number): null {
  return setSetting(db, 'active_kid_id', String(kidId));
}

// The PIN a grown-up set, or null while none is: grown-up screens stay open
// until one is (WJ-71).
export function findParentPin(db: Db): string | null {
  return getSetting(db, 'parent_pin');
}

// For the builds from before WJ-71, which ask for 000 while no PIN is set.
export function getParentPin(db: Db): string {
  return findParentPin(db) ?? DEFAULT_PARENT_PIN;
}

export function setParentPin(db: Db, pin: string): null {
  return setSetting(db, 'parent_pin', pin);
}

// Whether ticks ding and the last one plays a fanfare. On until a grown-up
// turns it off.
export function getSoundEnabled(db: Db): boolean {
  const value = getSetting(db, 'sound_enabled');
  return value === null ? true : value === '1';
}

export function setSoundEnabled(db: Db, enabled: boolean): null {
  return setSetting(db, 'sound_enabled', enabled ? '1' : '0');
}
