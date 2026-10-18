import { router } from 'expo-router';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScrollScreen } from '../src/components/ScrollScreen';
import {
  closeJoinCode,
  createJoinCode,
  JarCallError,
  listDevices,
  useFamilyJar,
  waitWords,
  type Device,
  type JoinCode,
} from '../src/db';
import { deviceName } from '../src/family/devices';
import { JoinQrCode } from '../src/family/JoinQrCode';
import { colors, fonts, primaryShadow, radius, spacing, typography } from '../src/theme';

// How often the screen looks for the new device in the family's list.
const POLL_MS = 3000;
const QR_SIZE = 200;

type ScreenState =
  | { status: 'loading' }
  | { status: 'error' }
  // The API asked to wait (WJ-51): too many codes from this connection.
  | { status: 'busy'; wait: string }
  | { status: 'waiting'; code: JoinCode }
  | { status: 'expired' }
  | { status: 'joined'; device: Device };

// Shows a one-time code (and its QR code) for another device to join the
// family with (WJ-48), and says so once it has.
export default function AddDeviceScreen() {
  const jar = useFamilyJar();
  const [state, setState] = useState<ScreenState>({ status: 'loading' });
  // Bumped by "Try again" and "Get a new code", which ask for a new code.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stopped = false;
    let open: JoinCode | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(current: JoinCode, known: Set<number>) {
      let joined: Device | undefined;
      try {
        joined = (await listDevices(jar)).find((device) => !known.has(device.id));
      } catch {
        // A blip in the connection: the next poll tries again.
      }
      if (stopped) return;
      if (joined) {
        open = null;
        setState({ status: 'joined', device: joined });
      } else if (Date.now() >= current.expiresAt) {
        open = null;
        setState({ status: 'expired' });
      } else {
        timer = setTimeout(() => poll(current, known), POLL_MS);
      }
    }

    async function start() {
      try {
        // The devices before the code, so the one that joins with it stands out.
        const known = new Set((await listDevices(jar)).map((device) => device.id));
        const created = await createJoinCode(jar);
        if (stopped) return closeJoinCode(jar, created.code);
        open = created;
        setState({ status: 'waiting', code: created });
        timer = setTimeout(() => poll(created, known), POLL_MS);
      } catch (error) {
        if (stopped) return;
        if (error instanceof JarCallError && error.tooMany) setState({ status: 'busy', wait: waitWords(error) });
        else setState({ status: 'error' });
      }
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      // Left before anyone used it: the code is no use now.
      if (open) closeJoinCode(jar, open.code);
    };
  }, [jar, attempt]);

  const newCode = () => {
    setState({ status: 'loading' });
    setAttempt((count) => count + 1);
  };

  if (state.status === 'loading') {
    return (
      <ScrollScreen contentContainerStyle={styles.centre}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ScrollScreen>
    );
  }
  if (state.status === 'error') {
    return (
      <Message emoji="📶" text="Couldn't get a code. Check the internet, then try again.">
        <Button label="Try again" onPress={newCode} />
      </Message>
    );
  }
  if (state.status === 'busy') {
    return (
      <Message
        emoji="⏳"
        text={`Lots of codes have been asked for from this internet connection. Wait ${state.wait}, then try again.`}
      >
        <Button label="Try again" onPress={newCode} />
      </Message>
    );
  }
  if (state.status === 'expired') {
    return (
      <Message emoji="⏰" text="That code ran out. Codes work for 10 minutes.">
        <Button label="Get a new code" onPress={newCode} />
      </Message>
    );
  }
  if (state.status === 'joined') {
    return (
      <Message emoji="🎉" text={`${deviceName(state.device)} joined the family jar!`}>
        <Button label="Done" onPress={() => router.back()} />
      </Message>
    );
  }

  const { code } = state.code;
  return (
    <ScrollScreen>
      <View style={styles.waiting}>
        <View style={styles.steps}>
          <Text style={styles.step}>On the new device, open Wish Jar and pick “Join a family jar”.</Text>
          <Text style={styles.muted}>Then type this code:</Text>
          <Text style={styles.code} selectable>
            {code.slice(0, 3)} {code.slice(3)}
          </Text>
          <Text style={styles.muted}>
            Or scan the QR code with a phone&apos;s camera to use Wish Jar in its browser.
          </Text>
        </View>
        <JoinQrCode code={code} size={QR_SIZE} />
      </View>
      <View style={styles.waitingRow}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>
          Waiting for the new device… The code works once, for 10 minutes.
        </Text>
      </View>
      <View style={styles.warning}>
        <Text style={styles.warningText}>
          Whatever is on the new device now stays behind: it gets this family&apos;s kids, tasks
          and wishes instead.
        </Text>
      </View>
    </ScrollScreen>
  );
}

function Message({ emoji, text, children }: PropsWithChildren<{ emoji: string; text: string }>) {
  return (
    <ScrollScreen contentContainerStyle={styles.centre}>
      <Text style={styles.messageEmoji}>{emoji}</Text>
      <Text style={styles.messageText}>{text}</Text>
      {children}
    </ScrollScreen>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.button} onPress={onPress} accessibilityRole="button">
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  waiting: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  steps: { flexGrow: 1, flexShrink: 1, flexBasis: 280, gap: spacing.sm },
  step: { ...typography.body, color: colors.text, fontFamily: fonts.semibold },
  muted: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  code: {
    ...typography.hero,
    color: colors.text,
    fontSize: 48,
    lineHeight: 60,
    letterSpacing: 8,
  },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  warning: {
    backgroundColor: '#FFF3C4',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.sunshine,
    padding: spacing.md,
  },
  warningText: { ...typography.caption, color: colors.text },
  messageEmoji: { fontSize: 56 },
  messageText: { ...typography.heading, color: colors.text, textAlign: 'center' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    ...primaryShadow,
  },
  buttonText: { ...typography.heading, color: colors.surface },
});
