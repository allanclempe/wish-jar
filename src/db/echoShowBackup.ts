import {
  backupDatabaseAsync,
  deserializeDatabaseAsync,
  useSQLiteContext,
  type SQLiteDatabase,
} from 'expo-sqlite';
import { useEffect } from 'react';

import { getAlexaDeviceId } from '../device/alexa';
import { PHOTO_RELAY_URL } from '../photos/phoneRelay';

// The Echo Show's web view drops all storage, OPFS included, when the skill
// session ends (Amazon's Web API for Games runtime), so Wish Jar would start
// empty at every launch (WJ-45). The relay keeps a copy of the database under
// the device's Alexa id: it is restored into a fresh database before the
// migrations run, and a new copy is sent a few seconds after each change.
// Photos live in the database as data URIs on web, so the copy holds them too.
const BACKUP_URL = `${PHOTO_RELAY_URL}/backup`;
const UPLOAD_EVERY_MS = 5_000;

// The relay couldn't be asked for the backup. Starting empty instead would
// upload that empty database over the real one, so the app waits for a retry.
export class BackupUnavailableError extends Error {}

// Set once the database holds the backup (or the relay has none), and only
// then do uploads start.
let backupKey: string | null = null;

export async function restoreEchoShowBackup(db: SQLiteDatabase): Promise<void> {
  let deviceId: string | null;
  try {
    deviceId = await getAlexaDeviceId();
  } catch (error) {
    throw new BackupUnavailableError(String(error));
  }
  if (!deviceId) return;

  // Already filled earlier in this skill session (the page reloaded): it is
  // newer than the relay's copy.
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((row?.user_version ?? 0) > 0) {
    backupKey = deviceId;
    return;
  }

  let response: Response;
  try {
    response = await fetch(BACKUP_URL, { headers: { Authorization: `Bearer ${deviceId}` } });
  } catch (error) {
    throw new BackupUnavailableError(String(error));
  }
  if (response.status === 404) {
    backupKey = deviceId;
    return;
  }
  if (!response.ok) throw new BackupUnavailableError(`Backup: HTTP ${response.status}`);

  const snapshot = await gunzip(await response.arrayBuffer());
  // A file in WAL mode (bytes 18 and 19 set to 2) can't be read as an
  // in-memory database; the snapshot already holds every committed page.
  snapshot[18] = 1;
  snapshot[19] = 1;
  const source = await deserializeDatabaseAsync(snapshot);
  try {
    await backupDatabaseAsync({ sourceDatabase: source, destDatabase: db });
  } finally {
    await source.closeAsync();
  }
  backupKey = deviceId;
}

// Rendered inside the SQLiteProvider. total_changes() counts every row this
// connection has written, so a new value means there's something to send.
export function EchoShowBackup() {
  const db = useSQLiteContext();

  useEffect(() => {
    const key = backupKey;
    if (!key) return;
    let sentAt = -1;
    let busy = false;

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const row = await db.getFirstAsync<{ changes: number }>(
          'SELECT total_changes() AS changes',
        );
        const changes = row?.changes ?? 0;
        if (changes === sentAt || (await db.isInTransactionAsync())) return;
        const body = await gzip(await db.serializeAsync());
        const response = await fetch(BACKUP_URL, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${key}` },
          body,
        });
        if (!response.ok) throw new Error(`Backup: HTTP ${response.status}`);
        sentAt = changes;
      } catch (error) {
        // Tried again on the next tick.
        console.warn('Echo Show backup failed', error);
      } finally {
        busy = false;
      }
    };

    void tick();
    const timer = setInterval(tick, UPLOAD_EVERY_MS);
    return () => clearInterval(timer);
  }, [db]);

  return null;
}

async function gzip(data: Uint8Array): Promise<ArrayBuffer> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function gunzip(data: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
