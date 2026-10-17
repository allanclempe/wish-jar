import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { JoinFamilyForm } from '../family/JoinFamilyForm';
import { SetUpJar } from '../family/SetUpJar';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { FirstLaunchBusy } from './firstLaunch';
import { createJarClient, JarCallError, type FamilyJar, type JarProblem } from './jar';
import { echoShowSetupNote, openFamilyJar, startFamilyJar } from './open';

// While the relay can't be reached, the app tries again this often by itself:
// a frame on the wall has nobody to tap "Try again".
const RECONNECT_EVERY_MS = 5_000;

const FamilyJarContext = createContext<FamilyJar | null>(null);
// Switches the app to another family's jar once this device has joined it
// (WJ-48).
const SwitchFamilyContext = createContext<((token: string) => void) | null>(null);

// The jar is online only (WJ-47): without the relay there's a reconnecting
// screen, never a stale copy. A device with no family yet starts one or joins
// one first (SetUpJar).
export function FamilyJarProvider({ children }: PropsWithChildren) {
  const [opening, setOpening] = useState(0);
  // Whether to open the device's family, or make one (Start a new jar).
  const [starting, setStarting] = useState(false);
  // undefined until known; null when the device has no family yet.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [openFailure, setOpenFailure] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    // The last failure stays up while this try runs.
    (starting ? startFamilyJar() : openFamilyJar()).then(
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
  }, [opening, starting]);

  const retryOpening = useCallback(() => setOpening((attempt) => attempt + 1), []);

  const switchFamily = useCallback((joined: string) => {
    setOpenFailure(null);
    setToken(joined);
  }, []);

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
  if (token === undefined) return null;
  if (token === null) {
    return (
      <SetUpJar
        starting={starting}
        note={echoShowSetupNote()}
        onStart={() => setStarting(true)}
        onJoined={switchFamily}
      />
    );
  }
  // A new token is another family: everything under it starts afresh.
  return (
    <SwitchFamilyContext.Provider value={switchFamily}>
      <ConnectedJar key={token} token={token} onJoined={switchFamily}>
        {children}
      </ConnectedJar>
    </SwitchFamilyContext.Provider>
  );
}

function ConnectedJar({
  token,
  onJoined,
  children,
}: PropsWithChildren<{ token: string; onJoined: (token: string) => void }>) {
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
  // A device taken out of its family can only join one again (WJ-48).
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    if (!lost || checking) return;
    const timer = setTimeout(reconnect, RECONNECT_EVERY_MS);
    return () => clearTimeout(timer);
  }, [lost, checking, reconnect]);

  return (
    <FamilyJarContext.Provider value={jar}>
      <View style={styles.fill}>
        {children}
        {problem && joining ? (
          <View style={StyleSheet.absoluteFill}>
            <RejoinFamily onJoined={onJoined} onBack={() => setJoining(false)} />
          </View>
        ) : problem ? (
          <View style={StyleSheet.absoluteFill}>
            <JarUnavailable
              title={lost ? 'Reconnecting…' : undefined}
              message={problemMessage(problem)}
              onRetry={reconnect}
              onJoin={problem.error.unknownDevice ? () => setJoining(true) : undefined}
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
    return "The family jar doesn't know this device any more. It may have been removed from the family: join it again with a code from another of its devices.";
  }
  const unsaved = write ? " The last change didn't save." : '';
  return `Wish Jar can't reach the family jar. Check the Wi-Fi — it keeps trying.${unsaved}`;
}

function JarUnavailable({
  title = 'One moment…',
  message,
  onRetry,
  onJoin,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
  onJoin?: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.buttons}>
        <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        {onJoin ? (
          <Pressable style={styles.button} onPress={onJoin} accessibilityRole="button">
            <Text style={styles.buttonText}>🔗 Join a family jar</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// Joining again from the "doesn't know this device" screen. The old jar is
// out of reach already, so there's nothing to warn about.
function RejoinFamily({ onJoined, onBack }: { onJoined: (token: string) => void; onBack: () => void }) {
  return (
    <ScrollView
      style={styles.rejoin}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>
        <Text style={styles.title}>🔗 Join a family jar</Text>
        <Text style={styles.message}>
          On a device still in the family, open Grown-ups → Devices → Add a device, then type the
          code it shows.
        </Text>
        <JoinFamilyForm onJoined={onJoined} />
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
      </View>
    </ScrollView>
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

// Swaps the app over to the family this device has just joined (WJ-48): every
// screen starts again from the new jar.
export function useSwitchFamily(): (token: string) => void {
  const switchFamily = useContext(SwitchFamilyContext);
  if (!switchFamily) {
    throw new Error('useSwitchFamily must be used inside FamilyJarProvider');
  }
  return switchFamily;
}

export type { FamilyJar };

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  rejoin: { flex: 1, backgroundColor: colors.background },
  column: { width: '100%', maxWidth: 560, alignItems: 'center', gap: spacing.md },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  message: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  back: { ...typography.body, color: colors.textMuted, fontFamily: fonts.semibold },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
  },
  buttonText: { ...typography.body, color: colors.surface, fontFamily: fonts.bold },
});
