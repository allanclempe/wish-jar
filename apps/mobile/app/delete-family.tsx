import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { ScrollScreen } from '../src/components/ScrollScreen';
import { JarCallError, listDevices, useFamilyJar, useSwitchFamily } from '../src/db';
import { deleteFamilyJar } from '../src/db/open';
import { colors, radius, spacing, typography } from '../src/theme';

// What the grown-up types before the button works: deleting the family can't
// be undone, so a tap alone never does it.
const CONFIRM_WORD = 'DELETE';

// Deletes the whole family jar for good (WJ-76): every kid, task, wish, coin
// and photo, on every device. Every device is out, this one included, and goes
// back to the setup screen.
export default function DeleteFamilyScreen() {
  const jar = useFamilyJar();
  const switchFamily = useSwitchFamily();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // How many other devices are in the family, once known.
  const [others, setOthers] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDevices(jar).then(
      (devices) => {
        if (!cancelled) setOthers(devices.filter((device) => !device.thisDevice).length);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [jar]);

  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function remove() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setFailure(null);
    try {
      await deleteFamilyJar(jar);
    } catch (error) {
      setFailure(
        error instanceof JarCallError && error.lost
          ? "Wish Jar can't reach the family jar, so nothing was deleted. Check the Wi-Fi and try again."
          : 'Something went wrong, so nothing was deleted. Please try again.',
      );
      setDeleting(false);
      return;
    }
    switchFamily(null);
  }

  const devicesOut =
    others == null
      ? 'Every device sharing this jar is disconnected, this one too.'
      : others === 0
        ? 'This device is disconnected from it.'
        : `${others === 1 ? 'The other device' : `All ${others} other devices`} sharing this jar ${others === 1 ? 'is' : 'are'} disconnected, and this one too.`;

  return (
    <ScrollScreen>
      <Text style={styles.title}>Delete this family jar?</Text>
      <Text style={styles.body}>
        Every kid, task, wish, coin, consequence and photo in it is deleted for good. {devicesOut}{' '}
        They go back to the start, where you can start a new jar or join another.
      </Text>
      <Text style={styles.warning}>This can&apos;t be undone. Nobody can get the jar back.</Text>

      <Text style={styles.label}>Type {CONFIRM_WORD} to confirm</Text>
      <TextInput
        style={styles.input}
        value={typed}
        onChangeText={setTyped}
        placeholder={CONFIRM_WORD}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!deleting}
        maxLength={20}
        returnKeyType="done"
        onSubmitEditing={remove}
        accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
      />

      {failure ? <Text style={styles.failure}>{failure}</Text> : null}

      <Pressable
        style={[styles.button, (!confirmed || deleting) && styles.buttonDisabled]}
        onPress={remove}
        disabled={!confirmed || deleting}
        accessibilityRole="button"
      >
        {deleting ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.buttonText}>Delete the family jar for good</Text>
        )}
      </Pressable>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.text },
  body: { ...typography.body, color: colors.text, marginTop: spacing.sm },
  warning: { ...typography.body, color: colors.accent, marginTop: spacing.sm },
  label: { ...typography.caption, color: colors.textMuted, marginTop: spacing.lg },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  failure: { ...typography.body, color: colors.accent, marginTop: spacing.md },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.heading, color: colors.surface },
});
