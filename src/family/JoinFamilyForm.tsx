import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { JarCallError } from '../db/jar';
import { joinFamilyJar } from '../db/open';
import { colors, fonts, primaryShadow, radius, spacing, typography } from '../theme';

// What a join code looks like once spaces and dashes are gone.
const CODE_LENGTH = 6;

function normalise(typed: string): string {
  return typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

type Props = {
  // From the QR code's link (?join=), when the device was opened with it.
  initialCode?: string;
  // What happens to the jar this device has now, shown above the button.
  warning?: string;
  buttonLabel?: string;
  onJoined: (token: string) => void;
};

// Types the code shown on a device already in the family (Settings → Devices
// → Add a device) and joins that family with a token of this device's own.
export function JoinFamilyForm({ initialCode = '', warning, buttonLabel = 'Join', onJoined }: Props) {
  const [typed, setTyped] = useState(() => normalise(initialCode).slice(0, CODE_LENGTH));
  const [joining, setJoining] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const code = normalise(typed);
  const canJoin = code.length === CODE_LENGTH && !joining;

  async function join() {
    if (!canJoin) return;
    setJoining(true);
    setProblem(null);
    try {
      onJoined(await joinFamilyJar(code));
    } catch (error) {
      setProblem(joinProblem(error));
      setJoining(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>The code on the other device</Text>
      <TextInput
        style={styles.input}
        value={typed}
        onChangeText={(text) => {
          setTyped(text.toUpperCase());
          setProblem(null);
        }}
        placeholder="K7P 4XM"
        placeholderTextColor={colors.border}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        // Room for a space or a dash in the middle.
        maxLength={CODE_LENGTH + 1}
        returnKeyType="go"
        onSubmitEditing={join}
        accessibilityLabel="Join code"
      />
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      {warning ? (
        <View style={styles.warning}>
          <Text style={styles.warningEmoji}>⚠️</Text>
          <Text style={styles.warningText}>{warning}</Text>
        </View>
      ) : null}
      <Pressable
        style={[styles.button, !canJoin && styles.buttonDisabled]}
        onPress={join}
        disabled={!canJoin}
        accessibilityRole="button"
      >
        {joining ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

function joinProblem(error: unknown): string {
  // The token came but couldn't be kept, and the code is used up.
  if (!(error instanceof JarCallError)) {
    return 'Could not keep the family jar on this device. Ask for a new code, then try again.';
  }
  if (error.status === 410) {
    return 'That code has run out or was already used. Ask for a new one on a device in the family.';
  }
  if (error.status === 400) return "That's not a code. It's 6 letters and numbers, like K7P 4XM.";
  if (error.status === 429) return 'Too many wrong codes. Wait a few minutes, then try again.';
  if (error.lost) return "Wish Jar can't reach the family jar. Check the Wi-Fi, then try again.";
  return `Could not join: ${error.message}`;
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, alignSelf: 'stretch' },
  label: { ...typography.caption, color: colors.textMuted },
  input: {
    ...typography.title,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  problem: { ...typography.body, color: colors.accent, textAlign: 'center' },
  warning: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: '#FFF3C4',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.sunshine,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  warningEmoji: { fontSize: 22 },
  warningText: { ...typography.body, color: colors.text, flex: 1 },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...primaryShadow,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.heading, color: colors.surface, fontFamily: fonts.display },
});
