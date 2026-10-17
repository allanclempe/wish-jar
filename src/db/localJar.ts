import { openDatabaseAsync } from 'expo-sqlite';

import type { JarImport } from './jar';
import { migrateDatabase } from './migrations';

// The jar each device kept in its own SQLite before the family jar went online
// (WJ-47). Read once, on the first launch after the update, to start the
// family from it. The file is left as it was: once the family has it, nothing
// opens it again.
export const DATABASE_NAME = 'wish-jar.db';

// The settings the family jar takes (relay/src/jar/settings.ts).
const SETTING_KEYS = ['active_kid_id', 'parent_pin', 'sound_enabled'];

type Row<Table extends keyof JarImport> = NonNullable<JarImport[Table]>[number];

export type LocalJar = { jar: JarImport; activeKidId: number | null };

// The device's jar as of now, or null when there is none: a new install, or a
// database that was never set up. A database too old for the family jar is
// brought up to date first, as the app used to at every launch.
export async function readLocalJar(): Promise<LocalJar | null> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  try {
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((row?.user_version ?? 0) === 0) return null;
    await migrateDatabase(db);

    // Every column the jar takes, by name, so its import (relay/src/jar/
    // importJar.ts) gets each table exactly as version 10 has it.
    const jar: JarImport = {
      kids: await db.getAllAsync<Row<'kids'>>('SELECT id, name, photo_uri, created_at FROM kids'),
      tasks: await db.getAllAsync<Row<'tasks'>>(
        'SELECT id, name, period, coin_amount, icon_emoji, icon_photo_uri, created_at FROM tasks',
      ),
      consequence_types: await db.getAllAsync<Row<'consequence_types'>>(
        'SELECT id, name, coin_amount, icon_emoji, icon_photo_uri, created_at FROM consequence_types',
      ),
      wishes: await db.getAllAsync<Row<'wishes'>>(
        'SELECT id, kid_id, name, coin_amount, icon_emoji, icon_photo_uri, created_at, claimed_at FROM wishes',
      ),
      completions: await db.getAllAsync<Row<'completions'>>(
        'SELECT kid_id, task_id, day_key, coin_amount, created_at FROM completions',
      ),
      kid_savings: await db.getAllAsync<Row<'kid_savings'>>('SELECT kid_id, amount FROM kid_savings'),
      consequences: await db.getAllAsync<Row<'consequences'>>(
        'SELECT id, kid_id, consequence_type_id, name, coin_amount, day_key, created_at FROM consequences',
      ),
      app_settings: await db.getAllAsync<Row<'app_settings'>>(
        `SELECT key, value FROM app_settings WHERE key IN (${SETTING_KEYS.map(() => '?').join(', ')})`,
        SETTING_KEYS,
      ),
    };
    const activeKid = jar.app_settings?.find((setting) => setting.key === 'active_kid_id');
    return { jar, activeKidId: activeKid ? Number(activeKid.value) : null };
  } finally {
    await db.closeAsync().catch(() => {});
  }
}
