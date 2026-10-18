import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { DEFAULT_KID_EMOJI, IconPicker, KID_EMOJIS } from '../src/components/Icons';
import { ScrollScreen } from '../src/components/ScrollScreen';
import { discardPhoto, insertKid, saveProblem, useFamilyJar, type Icon } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

export default function AddKidScreen() {
  const jar = useFamilyJar();
  const { refreshKids } = useActiveKid();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<Icon>({ emoji: DEFAULT_KID_EMOJI, photoUri: null });
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    let storedPhotoUri: string | null = null;
    try {
      storedPhotoUri = icon.photoUri ? await storePhoto(jar, icon.photoUri) : null;
      await insertKid(jar, { name, photoUri: storedPhotoUri, emoji: icon.emoji });
      await refreshKids();
      router.back();
    } catch (error) {
      discardPhoto(jar, storedPhotoUri);
      Alert.alert('Could not save', saveProblem(error));
      setSaving(false);
    }
  }

  return (
    <ScrollScreen>
      <IconPicker value={icon} fallbackEmoji={DEFAULT_KID_EMOJI} onChange={setIcon} emojis={KID_EMOJIS} />

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
