import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { insertTask, useDatabase } from '../src/db';
import { colors, radius, spacing, typography } from '../src/theme';

type Errors = { name?: string; coinAmount?: string };

export default function AddTaskScreen() {
  const db = useDatabase();
  const [name, setName] = useState('');
  const [coinAmount, setCoinAmount] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (name.trim().length === 0) {
      next.name = 'Give the task a name.';
    }
    const coins = coinAmount.trim();
    if (!/^\d+$/.test(coins) || Number(coins) <= 0) {
      next.coinAmount = 'Coins must be a positive whole number.';
    }
    return next;
  }

  async function save() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.coinAmount || saving) return;

    setSaving(true);
    try {
      await insertTask(db, { name, coinAmount: Number(coinAmount.trim()) });
      router.back();
    } catch {
      Alert.alert('Could not save', 'Something went wrong while saving. Please try again.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.label}>Task</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(text) => {
            setName(text);
            setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="e.g. Brush teeth"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="sentences"
          autoCorrect={false}
          maxLength={60}
          returnKeyType="next"
        />
        {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

        <Text style={styles.label}>Coins earned</Text>
        <TextInput
          style={styles.input}
          value={coinAmount}
          onChangeText={(text) => {
            setCoinAmount(text);
            setErrors((prev) => ({ ...prev, coinAmount: undefined }));
          }}
          placeholder="e.g. 5"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={4}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {errors.coinAmount ? <Text style={styles.error}>{errors.coinAmount}</Text> : null}

        <Pressable
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Save</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md, alignItems: 'stretch' },
  label: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md },
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
  error: { ...typography.caption, color: colors.accent, marginTop: -spacing.sm },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.heading, color: colors.surface },
});
