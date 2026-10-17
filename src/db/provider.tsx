import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing, typography } from '../theme';
import { FirstLaunchBusy } from './firstLaunch';
import { createJarClient, JarCallError, type FamilyJar, type JarProblem } from './jar';
import { openFamilyJar } from './open';

// While the relay can't be reached, the app tries again this often by itself:
// a frame on the wall has nobody to tap "Try again".
const RECONNECT_EVERY_MS = 5_000;

const FamilyJarContext = createContext<FamilyJar | null>(null);

// The jar is online only (WJ-47): without the relay there's a reconnecting
// screen, never a stale copy.
export function FamilyJarProvider({ children }: PropsWithChildren) {
  const [opening, setOpening] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [openFailure, setOpenFailure] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    // The last failure stays up while this try runs.
    openFamilyJar().then(
      (opened) => {
        if (cancelled) return;
        setOpenFailure(null);
        setToken(opened);
      },
      (error: unknown) => {
        if (!cancelled) setOpenFailure(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [opening]);

  const retryOpening = useCallback(() => setOpening((attempt) => attempt + 1), []);

  // A lost connection is tried again by itself, after every failed try;
  // anything else waits for a tap.
  useEffect(() => {
    if (!(openFailure instanceof JarCallError && openFailure.lost)) return;
    const timer = setTimeout(retryOpening, RECONNECT_EVERY_MS);
    return () => clearTimeout(timer);
  }, [openFailure, retryOpening]);

  if (openFailure != null) {
    return <JarUnavailable message={openingMessage(openFailure)} onRetry={retryOpening} />;
  }
  if (token == null) return null;
  return <ConnectedJar token={token}>{children}</ConnectedJar>;
}

function ConnectedJar({ token, children }: PropsWithChildren<{ token: string }>) {
  const [problem, setProblem] = useState<JarProblem | null>(null);
  // Something on screen failed to load while the connection was lost.
  const readFailed = useRef(false);
  const [jar, setJar] = useState(() => createClient());

  function createClient(): FamilyJar {
    return createJarClient(token, (next) => {
      if (!next.write) readFailed.current = true;
      // A write that didn't save stays on the screen until the jar is back.
      setProblem((current) => (current?.write ? current : next));
    });
  }

  const [checking, setChecking] = useState(false);
  const reconnect = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      await createJarClient(token).call('getSoundEnabled');
    } catch {
      return;
    } finally {
      setChecking(false);
    }
    setProblem(null);
    // A new handle reruns everything that loads from the jar (it's in their
    // effects' dependencies), so what failed to load comes in now. Only when
    // something did fail: an edit screen whose save failed keeps its edits.
    if (readFailed.current) {
      readFailed.current = false;
      setJar(createClient());
    }
    // createClient only reads `token`, which this component never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, token]);

  const lost = problem?.error.lost ?? false;
  useEffect(() => {
    if (!lost || checking) return;
    const timer = setTimeout(reconnect, RECONNECT_EVERY_MS);
    return () => clearTimeout(timer);
  }, [lost, checking, reconnect]);

  return (
    <FamilyJarContext.Provider value={jar}>
      <View style={styles.fill}>
        {children}
        {problem ? (
          <View style={StyleSheet.absoluteFill}>
            <JarUnavailable
              title={lost ? 'Reconnecting…' : undefined}
              message={problemMessage(problem)}
              onRetry={reconnect}
            />
          </View>
        ) : null}
      </View>
    </FamilyJarContext.Provider>
  );
}

function openingMessage(error: unknown): string {
  if (error instanceof FirstLaunchBusy) return error.message;
  if (!(error instanceof JarCallError)) {
    return 'Could not open the jar kept on this device. Try again.';
  }
  if (error.lost) {
    return "Wish Jar can't reach the family jar. Check the Wi-Fi — it keeps trying. Everything is still safe on this device.";
  }
  return `The family jar couldn't be set up: ${error.message}. Everything is still safe on this device.`;
}

function problemMessage({ error, write }: JarProblem): string {
  if (error.unknownDevice) {
    return "The family jar doesn't know this device any more.";
  }
  const unsaved = write ? " The last change didn't save." : '';
  return `Wish Jar can't reach the family jar. Check the Wi-Fi — it keeps trying.${unsaved}`;
}

function JarUnavailable({
  title = 'One moment…',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

// The handle every src/db function takes first. It changes when the jar comes
// back after a lost connection, so effects that load from it run again.
export function useFamilyJar(): FamilyJar {
  const jar = useContext(FamilyJarContext);
  if (!jar) {
    throw new Error('useFamilyJar must be used inside FamilyJarProvider');
  }
  return jar;
}

export type { FamilyJar };

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
  buttonText: { ...typography.body, color: colors.surface, fontFamily: fonts.bold },
});
