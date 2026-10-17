import { useEffect, useEffectEvent, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { wordsFor } from '../db/jar';
import { colors, fonts, radius, spacing, typography } from '../theme';
import {
  closeRelayCode,
  collectRelayPhoto,
  createRelayCode,
  PHOTO_RELAY_URL,
  relayQrUri,
  TooManyCodes,
  type RelayCode,
} from './phoneRelay';

const POLL_MS = 2000;
const QR_SIZE = 220;

type SheetState =
  | { status: 'loading' }
  | { status: 'error' }
  // The relay asked to wait (WJ-51): too many codes from this connection.
  | { status: 'busy'; wait: string }
  | { status: 'waiting'; code: RelayCode }
  | { status: 'expired' };

// Asks a parent's phone for a photo through the photo relay: shows a QR code
// (and a code to type) that opens the relay's page on the phone, then waits
// for the photo. Resolves through onDone with it as a data URI, or null on
// Cancel. The QR code is an SVG, which <Image> only draws on web.
export function PhonePhotoSheet({ onDone }: { onDone: (uri: string | null) => void }) {
  const [state, setState] = useState<SheetState>({ status: 'loading' });
  // Bumped by "Try again" and "Get a new code", which ask for a new code.
  const [attempt, setAttempt] = useState(0);
  const deliver = useEffectEvent((uri: string) => onDone(uri));

  useEffect(() => {
    let stopped = false;
    let code: RelayCode | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(current: RelayCode) {
      let result: string | null = null;
      try {
        result = await collectRelayPhoto(current);
      } catch {
        // A blip in the connection: the next poll tries again.
      }
      if (stopped) return;
      if (result === 'expired' || Date.now() >= current.expiresAt) {
        code = null;
        setState({ status: 'expired' });
      } else if (result && result !== 'waiting') {
        code = null;
        deliver(result);
      } else {
        timer = setTimeout(() => poll(current), POLL_MS);
      }
    }

    createRelayCode().then(
      (created) => {
        if (stopped) return closeRelayCode(created);
        code = created;
        setState({ status: 'waiting', code: created });
        timer = setTimeout(() => poll(created), POLL_MS);
      },
      (error: unknown) => {
        if (stopped) return;
        if (error instanceof TooManyCodes) setState({ status: 'busy', wait: wordsFor(error.retryAfter) });
        else setState({ status: 'error' });
      },
    );

    return () => {
      stopped = true;
      clearTimeout(timer);
      // Cancelled before a photo came: the code is no use now.
      if (code) closeRelayCode(code);
    };
  }, [attempt]);

  const newCode = () => {
    setState({ status: 'loading' });
    setAttempt((count) => count + 1);
  };

  let content;
  if (state.status === 'loading') {
    content = <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />;
  } else if (state.status === 'error') {
    content = (
      <Message emoji="📶" text="Couldn't get a code. Check the internet, then try again.">
        <Button label="Try again" onPress={newCode} />
      </Message>
    );
  } else if (state.status === 'busy') {
    content = (
      <Message
        emoji="⏳"
        text={`Lots of photo codes have been asked for from this internet connection. Wait ${state.wait}, then try again.`}
      >
        <Button label="Try again" onPress={newCode} />
      </Message>
    );
  } else if (state.status === 'expired') {
    content = (
      <Message emoji="⏰" text="That code ran out. Codes work for 10 minutes.">
        <Button label="Get a new code" onPress={newCode} />
      </Message>
    );
  } else {
    const { code } = state.code;
    content = (
      <View style={styles.waiting}>
        <Image
          source={{ uri: relayQrUri(code) }}
          style={styles.qr}
          accessibilityLabel="QR code to scan with your phone"
        />
        <View style={styles.steps}>
          <Text style={styles.step}>Scan this with your phone&apos;s camera.</Text>
          <Text style={styles.muted}>
            Or go to {PHOTO_RELAY_URL.replace(/^https?:\/\//, '')} and type
          </Text>
          <Text style={styles.code} selectable>
            {code.slice(0, 3)} {code.slice(3)}
          </Text>
          <View style={styles.waitingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>Waiting for your photo… The code works for 10 minutes.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>📱 Send a photo from your phone</Text>
            <Text style={styles.subtitle}>
              Take or pick a photo on your phone, and it shows up here. No app or account needed.
            </Text>
          </View>
          <Pressable onPress={() => onDone(null)} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
        {content}
      </View>
    </View>
  );
}

function Message({ emoji, text, children }: PropsWithChildren<{ emoji: string; text: string }>) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageEmoji}>{emoji}</Text>
      <Text style={styles.messageText}>{text}</Text>
      {children}
    </View>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(61, 44, 46, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 760,
    maxHeight: '100%',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerText: { flex: 1, gap: spacing.xs },
  title: { ...typography.heading, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted },
  cancel: { ...typography.body, color: colors.textMuted, fontFamily: fonts.semibold },
  loading: { padding: spacing.xl },
  waiting: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  qr: { width: QR_SIZE, height: QR_SIZE, borderRadius: radius.md },
  steps: { flexGrow: 1, flexShrink: 1, flexBasis: 280, gap: spacing.sm },
  step: { ...typography.body, color: colors.text, fontFamily: fonts.semibold },
  muted: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  code: {
    ...typography.heading,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 40,
    lineHeight: 52,
    letterSpacing: 6,
  },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  message: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  messageEmoji: { fontSize: 44 },
  messageText: { ...typography.body, color: colors.text, textAlign: 'center' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  buttonText: { ...typography.body, color: colors.surface, fontFamily: fonts.bold },
});
