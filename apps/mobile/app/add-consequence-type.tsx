import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { ScrollScreen } from '../src/components/ScrollScreen';
import { IconPicker, CONSEQUENCE_EMOJIS } from '../src/components/Icons';
import {
  discardPhoto,
  insertConsequenceType,
  saveProblem,
  useFamilyJar,
  type Icon,
} from '../src/db';
import { storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

type Errors = { name?: string; coinAmount?: string };

export default function AddConsequenceTypeScreen() {
  const jar = useFamilyJar();
  const [name, setName] = useState('');
  const [coinAmount, setCoinAmount] = useState('');
  const [icon, setIcon] = useState<Icon>({ emoji: null, photoUri: null });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (name.trim().length === 0) {
      next.name = 'Name the consequence.';
    }
    const coins = coinAmount.trim();
    if (!/^\d+$/.test(coins)) {
      next.coinAmount = 'Coins must be a whole number, 0 or more.';
    }
    return next;
  }

  async function save() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.coinAmount || saving) return;

    setSaving(true);
    let storedPhotoUri: string | null = null;
    try {
      storedPhotoUri = icon.photoUri ? await storePhoto(jar, icon.photoUri) : null;
      await insertConsequenceType(jar, {
        name,
        coinAmount: Number(coinAmount.trim()),
        icon: { emoji: icon.emoji, photoUri: storedPhotoUri },
      });
      router.back();
    } catch (error) {
      discardPhoto(jar, storedPhotoUri);
      Alert.alert('Could not save', saveProblem(error));
      setSaving(false);
    }
  }

  return (
    <ScrollScreen>
      <IconPicker
        value={icon}
        fallbackEmoji="⚖️"
        emojis={CONSEQUENCE_EMOJIS}
        onChange={setIcon}
      />

      <Text style={styles.label}>Consequence</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(text) => {
          setName(text);
          setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        placeholder="e.g. Hit my brother"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={60}
        returnKeyType="next"
      />
      {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

      <Text style={styles.label}>Coins taken</Text>
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
        maxLength={5}
        returnKeyType="done"
        onSubmitEditing={save}
      />
      {errors.coinAmount ? <Text style={styles.error}>{errors.coinAmount}</Text> : null}
      <Text style={styles.hint}>Use 0 for a consequence that doesn’t cost coins.</Text>

      <Pressable
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={save}
        disabled={saving}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
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
  hint: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.sm },
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
