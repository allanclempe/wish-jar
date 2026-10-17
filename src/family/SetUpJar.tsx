import { useGlobalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radius, shadow, spacing, typography } from '../theme';
import { JoinFamilyForm } from './JoinFamilyForm';

type Props = {
  // Start was tapped and the family is being made.
  starting: boolean;
  onStart: () => void;
  onJoined: (token: string) => void;
};

// The first screen on a device with no family jar yet (WJ-48): start the
// family's jar here, or join the one the family already has with a code from
// another of its devices. A phone that scanned a join code's QR code lands
// here with the code filled in (?join=).
export function SetUpJar({ starting, onStart, onJoined }: Props) {
  const { join } = useGlobalSearchParams<{ join?: string }>();
  const [joining, setJoining] = useState(() => typeof join === 'string' && join.length > 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {joining ? (
            <>
              <Text style={styles.emoji}>🔗</Text>
              <Text style={styles.title}>Join a family jar</Text>
              <Text style={styles.subtitle}>
                On a device already in the family, open Grown-ups → Devices → Add a device, then type
                the code it shows.
              </Text>
              <JoinFamilyForm
                initialCode={typeof join === 'string' ? join : ''}
                warning="Anything already on this device stays behind: it doesn't come along to the family jar."
                onJoined={onJoined}
              />
              <Pressable onPress={() => setJoining(false)} accessibilityRole="button" hitSlop={12}>
                <Text style={styles.back}>‹ Back</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.emoji}>🫙</Text>
              <Text style={styles.title}>Welcome to Wish Jar!</Text>
              <Text style={styles.subtitle}>
                Is this the family&apos;s first device, or does the family have a jar already?
              </Text>
              <Choice
                emoji="✨"
                title="Start a new jar"
                text="For the family's first device. Anything already on this device comes along."
                busy={starting}
                onPress={onStart}
              />
              <Choice
                emoji="🔗"
                title="Join a family jar"
                text="Wish Jar is on another device already? Join its jar with a code from it."
                disabled={starting}
                onPress={() => setJoining(true)}
              />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ChoiceProps = {
  emoji: string;
  title: string;
  text: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function Choice({ emoji, title, text, busy = false, disabled = false, onPress }: ChoiceProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.choice,
        pressed && styles.choicePressed,
        disabled && styles.choiceDisabled,
      ]}
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
    >
      <View style={styles.choiceIcon}>
        <Text style={styles.choiceEmoji}>{emoji}</Text>
      </View>
      <View style={styles.choiceText}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceSubtitle}>{text}</Text>
      </View>
      {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

const ICON_SIZE = 64;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', alignItems: 'center', gap: spacing.md },
  emoji: { fontSize: 64 },
  title: { ...typography.hero, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  choice: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow,
  },
  choicePressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  choiceDisabled: { opacity: 0.5 },
  choiceIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceEmoji: { fontSize: 32 },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { ...typography.heading, color: colors.text },
  choiceSubtitle: { ...typography.caption, color: colors.textMuted },
  chevron: { fontSize: 32, color: colors.primary, fontFamily: fonts.semibold },
  back: { ...typography.body, color: colors.textMuted, fontFamily: fonts.semibold, marginTop: spacing.sm },
});
