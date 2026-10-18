// The first launch after the update reads the jar this browser kept in its own
// SQLite (localJar.ts), and two tabs must not both do it: each would start a
// family of its own.
//
// On web, expo-sqlite stores the database in OPFS through wa-sqlite's
// AccessHandlePoolVFS, which holds an exclusive sync access handle per file.
// A second tab — or a worker from a tab that has just closed and not yet
// released its handles — opening the same files throws
// NoModificationAllowedError. The Web Lock the app has always taken around the
// database makes one tab the owner (an older build still open in a tab holds
// it for good); any other tab gets a retry screen instead, and finds the
// family the first tab made when it tries again.
//
// expo-sqlite runs every database in one worker per page, and that worker
// cannot recover from a failed open: it keeps its half-initialised SQLite
// module and answers every later open with "Invalid VFS state". So a failed
// open reloads the page to get a fresh worker, and the attempt count lives in
// sessionStorage to stop the reloads once the handles stay held.
const DATABASE_LOCK = 'wish-jar:sqlite-database';
const RELOAD_ATTEMPTS_KEY = 'wish-jar:sqlite-reload-attempts';
const RETRY_DELAYS_MS = [300, 700, 1500];

// Its message is shown on the retry screen as it is.
export class FirstLaunchBusy extends Error {}

// Worker errors reach the main thread re-wrapped as `new Error(String(e))`,
// so the DOMException name lives on only in the message text.
function isAccessHandleConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('NoModificationAllowedError') ||
      error.message.includes('createSyncAccessHandle') ||
      error.message.includes('Invalid VFS state'))
  );
}

// Returns null when sessionStorage is unavailable, so the caller cannot count
// reloads and must not reload automatically.
function readReloadAttempts(): number | null {
  try {
    return Number(sessionStorage.getItem(RELOAD_ATTEMPTS_KEY) ?? 0) || 0;
  } catch {
    return null;
  }
}

function writeReloadAttempts(attempts: number): boolean {
  try {
    if (attempts === 0) {
      sessionStorage.removeItem(RELOAD_ATTEMPTS_KEY);
    } else {
      sessionStorage.setItem(RELOAD_ATTEMPTS_KEY, String(attempts));
    }
    return true;
  } catch {
    return false;
  }
}

// Runs `work` holding the database's lock, for as long as it takes.
export async function guardFirstLaunch<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await withLock(work);
  } catch (error) {
    if (!isAccessHandleConflict(error)) throw error;
    const attempts = readReloadAttempts();
    if (attempts != null && attempts < RETRY_DELAYS_MS.length && writeReloadAttempts(attempts + 1)) {
      setTimeout(() => window.location.reload(), RETRY_DELAYS_MS[attempts]);
      // The page is going away.
      return new Promise<T>(() => {});
    }
    writeReloadAttempts(0);
    throw new FirstLaunchBusy(
      'Could not open the jar kept on this device. Another tab may still be closing it — try again.',
    );
  }
}

// The family is made: the reloads start counting afresh next time.
export function firstLaunchDone(): void {
  writeReloadAttempts(0);
}

function withLock<T>(work: () => Promise<T>): Promise<T> {
  // Without Web Locks there is no way to coordinate tabs — go ahead.
  if (typeof navigator === 'undefined' || !navigator.locks) return work();
  return navigator.locks.request(DATABASE_LOCK, { ifAvailable: true }, (lock) => {
    if (lock == null) {
      throw new FirstLaunchBusy('Wish Jar is already open in another tab. Close that tab, then try again.');
    }
    return work();
  });
}
