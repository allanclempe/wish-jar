import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconPicker } from '../src/components/Icons';
import { insertWish, useDatabase, type Icon } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { removePhoto, storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

type Errors = { name?: string; coinAmount?: string; kidId?: string };

export default function AddWishScreen() {
  const db = useDatabase();
  const { kids } = useActiveKid();
  const [name, setName] = useState('');
  const [coinAmount, setCoinAmount] = useState('');
  const [kidId, setKidId] = useState<number | null>(null);
  const [icon, setIcon] = useState<Icon>({ emoji: null, photoUri: null });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (name.trim().length === 0) {
      next.name = 'Give the wish a name.';
    }
    const coins = coinAmount.trim();
    if (!/^\d+$/.test(coins) || Number(coins) === 0) {
      next.coinAmount = 'Coins must be a whole number, 1 or more.';
    }
    if (kidId === null) {
      next.kidId = 'Choose which kid this wish is for.';
    }
    return next;
  }

  async function save() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.coinAmount || nextErrors.kidId || saving || kidId === null) {
      return;
    }

    setSaving(true);
    let storedPhotoUri: string | null = null;
    try {
      storedPhotoUri = icon.photoUri ? await storePhoto(icon.photoUri) : null;
      await insertWish(db, {
        kidId,
        name,
        coinAmount: Number(coinAmount.trim()),
        icon: { emoji: icon.emoji, photoUri: storedPhotoUri },
      });
      router.back();
    } catch {
      removePhoto(storedPhotoUri);
      Alert.alert('Could not save', 'Something went wrong while saving. Please try again.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <IconPicker value={icon} fallbackEmoji="🎁" onChange={setIcon} />

        <Text style={styles.label}>Wish</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(text) => {
            setName(text);
            setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="e.g. Bike"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="sentences"
          autoCorrect={false}
          maxLength={60}
          returnKeyType="next"
        />
        {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

        <Text style={styles.label}>Coins it costs</Text>
        <TextInput
          style={styles.input}
          value={coinAmount}
          onChangeText={(text) => {
            setCoinAmount(text.replace(/\D/g, ''));
            setErrors((prev) => ({ ...prev, coinAmount: undefined }));
          }}
          placeholder="e.g. 50"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {errors.coinAmount ? <Text style={styles.error}>{errors.coinAmount}</Text> : null}

        <Text style={styles.label}>For which kid</Text>
        {kids.length === 0 ? (
          <Text style={styles.hint}>Add a kid first, then you can register their wishes.</Text>
        ) : (
          <View style={styles.kids}>
            {kids.map((kid) => {
              const selected = kid.id === kidId;
              return (
                <Pressable
                  key={kid.id}
                  style={[styles.kid, selected && styles.kidSelected]}
                  onPress={() => {
                    setKidId(kid.id);
                    setErrors((prev) => ({ ...prev, kidId: undefined }));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.kidText, selected && styles.kidTextSelected]}>
                    {kid.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {errors.kidId ? <Text style={styles.error}>{errors.kidId}</Text> : null}

        <Pressable
          style={[styles.button, (saving || kids.length === 0) && styles.buttonDisabled]}
          onPress={save}
          disabled={saving || kids.length === 0}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Save</Text>
        </Pressable>
      </ScrollView>
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
  hint: { ...typography.caption, color: colors.textMuted },
  kids: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kid: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  kidSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  kidText: { ...typography.body, color: colors.text, fontWeight: '600' },
  kidTextSelected: { color: colors.surface },
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
