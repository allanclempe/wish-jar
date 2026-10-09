import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';
import { migrateDatabase } from './migrations';

export const DATABASE_NAME = 'wish-jar.db';

// On web, expo-sqlite stores the database in OPFS through wa-sqlite's
// AccessHandlePoolVFS, which holds an exclusive sync access handle per file.
// A second tab — or a worker from a tab that has just closed and not yet
// released its handles — opening the same files throws
// NoModificationAllowedError. A Web Lock makes one tab the owner; any other
// tab gets a retry screen instead of a crash, and a short retry loop absorbs
// handles that linger briefly after a tab closes.
const DATABASE_LOCK = 'wish-jar:sqlite-database';
const RETRY_DELAYS_MS = [300, 700, 1500];

// Worker errors reach the main thread re-wrapped as `new Error(String(e))`,
// so the DOMException name lives on only in the message text.
function isAccessHandleConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('NoModificationAllowedError') ||
      error.message.includes('createSyncAccessHandle'))
  );
}

export function DatabaseProvider({ children }: PropsWithChildren) {
  const [lockState, setLockState] = useState<'pending' | 'granted' | 'taken'>(
    // Without Web Locks there is no way to coordinate tabs — open directly.
    () => (typeof navigator === 'undefined' || !navigator.locks ? 'granted' : 'pending'),
  );
  const [lockAttempt, setLockAttempt] = useState(0);
  const retriesRef = useRef(0);
  const [providerKey, setProviderKey] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.locks) return;
    let cancelled = false;
    navigator.locks
      .request(DATABASE_LOCK, { ifAvailable: true }, (lock) => {
        if (cancelled) return;
        if (lock == null) {
          setLockState('taken');
          return;
        }
        setLockState('granted');
        // Hold the lock until the tab closes.
        return new Promise<void>(() => {});
      })
      .catch(() => {
        if (!cancelled) setLockState('taken');
      });
    return () => {
      cancelled = true;
    };
  }, [lockAttempt]);

  if (lockState === 'taken') {
    return (
      <DatabaseUnavailable
        message="Wish Jar is already open in another tab. Close that tab, then try again."
        onRetry={() => setLockAttempt((attempt) => attempt + 1)}
      />
    );
  }

  if (unavailable) {
    return (
      <DatabaseUnavailable
        message="Could not open the local database. Another tab may still be closing it — try again."
        onRetry={() => {
          retriesRef.current = 0;
          setUnavailable(false);
          setProviderKey((key) => key + 1);
        }}
      />
    );
  }

  if (lockState !== 'granted') {
    return null;
  }

  return (
    <SQLiteProvider
      key={providerKey}
      databaseName={DATABASE_NAME}
      onInit={migrateDatabase}
      onError={(error) => {
        if (!isAccessHandleConflict(error)) {
          // Match the provider's default handler.
          throw error;
        }
        // SQLiteProvider calls onError during render, so defer the state update.
        queueMicrotask(() => {
          if (retriesRef.current < RETRY_DELAYS_MS.length) {
            const delay = RETRY_DELAYS_MS[retriesRef.current];
            retriesRef.current += 1;
            setTimeout(() => setProviderKey((key) => key + 1), delay);
          } else {
            setUnavailable(true);
          }
        });
      }}
    >
      {children}
    </SQLiteProvider>
  );
}

function DatabaseUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>One moment…</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function useDatabase(): SQLiteDatabase {
  return useSQLiteContext();
}

export type { SQLiteDatabase };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.heading, color: colors.text },
  message: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
  },
  buttonText: { ...typography.body, color: colors.surface, fontWeight: '700' },
});
