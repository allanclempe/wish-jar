import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeleteButton } from '../src/components/DeleteButton';
import { ScrollScreen } from '../src/components/ScrollScreen';
import { IconPicker } from '../src/components/Icons';
import { deleteWish, getWish, updateWish, useDatabase, type Icon } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { removePhoto, storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

type Errors = { name?: string; coinAmount?: string; kidId?: string };

export default function EditWishScreen() {
  const db = useDatabase();
  const { kids } = useActiveKid();
  const { id } = useLocalSearchParams<{ id: string }>();
  const wishId = Number(id);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [coinAmount, setCoinAmount] = useState('');
  const [kidId, setKidId] = useState<number | null>(null);
  const [icon, setIcon] = useState<Icon>({ emoji: null, photoUri: null });
  const [originalPhotoUri, setOriginalPhotoUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWish(db, wishId).then((wish) => {
      if (cancelled) return;
      if (!wish) {
        Alert.alert('Wish not found', 'This wish may have been removed.');
        router.back();
        return;
      }
      setName(wish.name);
      setCoinAmount(String(wish.coinAmount));
      setKidId(wish.kidId);
      setIcon(wish.icon);
      setOriginalPhotoUri(wish.icon.photoUri);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [db, wishId]);

  function validate(): Errors {
    const next: Errors = {};
    if (name.trim().length === 0) {
      next.name = 'Give the wish a name.';
    }
    const coins = coinAmount.trim();
    if (!/^\d+$/.test(coins) || Number(coins) === 0) {
      next.coinAmount = 'Coins must be a whole number, 1 or more.';
    }
    if (kidId === null || !kids.some((kid) => kid.id === kidId)) {
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
    let savedPhotoUri = icon.photoUri;
    try {
      if (icon.photoUri && icon.photoUri !== originalPhotoUri) {
        savedPhotoUri = await storePhoto(icon.photoUri);
      }
      const previousPhotoUri = await updateWish(db, wishId, {
        kidId,
        name,
        coinAmount: Number(coinAmount.trim()),
        icon: { emoji: icon.emoji, photoUri: savedPhotoUri },
      });
      if (previousPhotoUri !== savedPhotoUri) {
        removePhoto(previousPhotoUri);
      }
      router.back();
    } catch {
      if (savedPhotoUri !== icon.photoUri) {
        removePhoto(savedPhotoUri);
      }
      Alert.alert('Could not save', 'Something went wrong while saving. Please try again.');
      setSaving(false);
    }
  }

  async function remove() {
    if (saving) return;
    setSaving(true);
    try {
      removePhoto(await deleteWish(db, wishId));
      router.back();
    } catch {
      Alert.alert('Could not delete', 'Something went wrong while deleting. Please try again.');
      setSaving(false);
    }
  }

  if (!loaded) {
    return <SafeAreaView style={styles.safe} />;
  }

  return (
    <ScrollScreen>
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
              <Text style={[styles.kidText, selected && styles.kidTextSelected]}>{kid.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {errors.kidId ? <Text style={styles.error}>{errors.kidId}</Text> : null}

      <Pressable
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={save}
        disabled={saving}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>
      <DeleteButton
        label="Delete wish"
        title={`Delete "${name.trim() || 'this wish'}"?`}
        message="It comes off the wish list for good. Coins already spent on it stay spent."
        disabled={saving}
        onDelete={remove}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
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
