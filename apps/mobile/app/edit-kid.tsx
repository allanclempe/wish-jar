import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeleteButton } from '../src/components/DeleteButton';
import { IconPicker, KID_EMOJIS } from '../src/components/Icons';
import { ScrollScreen } from '../src/components/ScrollScreen';
import {
  deleteKid,
  discardPhoto,
  getKid,
  saveProblem,
  updateKid,
  useFamilyJar,
  type Icon,
} from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

export default function EditKidScreen() {
  const jar = useFamilyJar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const kidId = Number(id);
  const { refreshKids } = useActiveKid();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<Icon>({ emoji: null, photoUri: null });
  const [originalPhotoUri, setOriginalPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  useEffect(() => {
    let cancelled = false;
    getKid(jar, kidId).then(
      (kid) => {
        if (cancelled) return;
        if (!kid) {
          Alert.alert('Kid not found', 'This kid may have been removed.');
          router.back();
          return;
        }
        setName(kid.name);
        setIcon({ emoji: kid.emoji ?? null, photoUri: kid.photoUri });
        setOriginalPhotoUri(kid.photoUri);
        setLoaded(true);
      },
      // A failed load shows on the jar's reconnecting screen.
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [jar, kidId]);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    let savedPhotoUri = icon.photoUri;
    try {
      if (icon.photoUri && icon.photoUri !== originalPhotoUri) {
        savedPhotoUri = await storePhoto(jar, icon.photoUri);
      }
      await updateKid(jar, kidId, { name, photoUri: savedPhotoUri, emoji: icon.emoji });
      await refreshKids();
      router.back();
    } catch (error) {
      if (savedPhotoUri !== icon.photoUri) {
        discardPhoto(jar, savedPhotoUri);
      }
      Alert.alert('Could not save', saveProblem(error));
      setSaving(false);
    }
  }

  async function remove() {
    if (saving) return;
    setSaving(true);
    try {
      await deleteKid(jar, kidId);
      await refreshKids();
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
      <IconPicker value={icon} fallbackEmoji="🙂" onChange={setIcon} emojis={KID_EMOJIS} />

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Their name"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={save}
      />

      <Pressable
        style={[styles.button, !canSave && styles.buttonDisabled]}
        onPress={save}
        disabled={!canSave}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>
      <DeleteButton
        label="Delete kid"
        title={`Delete ${name.trim() || 'this kid'}?`}
        message="Their wishes, coins and everything they've done go too. This can't be undone."
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
