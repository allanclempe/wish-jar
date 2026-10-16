import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeleteButton } from '../src/components/DeleteButton';
import { ScrollScreen } from '../src/components/ScrollScreen';
import { IconPicker, CONSEQUENCE_EMOJIS } from '../src/components/Icons';
import {
  deleteConsequenceType,
  getConsequenceType,
  updateConsequenceType,
  useDatabase,
  type Icon,
} from '../src/db';
import { removePhoto, storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

type Errors = { name?: string; coinAmount?: string };

export default function EditConsequenceTypeScreen() {
  const db = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();
  const consequenceTypeId = Number(id);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [coinAmount, setCoinAmount] = useState('');
  const [icon, setIcon] = useState<Icon>({ emoji: null, photoUri: null });
  const [originalPhotoUri, setOriginalPhotoUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getConsequenceType(db, consequenceTypeId).then((type) => {
      if (cancelled) return;
      if (!type) {
        Alert.alert('Consequence not found', 'This consequence may have been removed.');
        router.back();
        return;
      }
      setName(type.name);
      setCoinAmount(String(type.coinAmount));
      setIcon(type.icon);
      setOriginalPhotoUri(type.icon.photoUri);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [db, consequenceTypeId]);

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
    let savedPhotoUri = icon.photoUri;
    try {
      if (icon.photoUri && icon.photoUri !== originalPhotoUri) {
        savedPhotoUri = await storePhoto(icon.photoUri);
      }
      const previousPhotoUri = await updateConsequenceType(db, consequenceTypeId, {
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
      removePhoto(await deleteConsequenceType(db, consequenceTypeId));
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
      <DeleteButton
        label="Delete consequence"
        title={`Delete "${name.trim() || 'this consequence'}"?`}
        message="It can't be picked any more. Times it was already given stay as they were."
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
