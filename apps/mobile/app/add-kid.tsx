import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { ScrollScreen } from '../src/components/ScrollScreen';
import { discardPhoto, insertKid, saveProblem, useFamilyJar } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { PhotoSourceButtons, usePickPhoto } from '../src/photos/PhotoPicker';
import { storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

export default function AddKidScreen() {
  const jar = useFamilyJar();
  const { refreshKids } = useActiveKid();
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pickPhoto = usePickPhoto();

  const canSave = name.trim().length > 0 && !saving;

  async function choosePhoto() {
    const uri = await pickPhoto();
    if (uri) setPhotoUri(uri);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    let storedPhotoUri: string | null = null;
    try {
      storedPhotoUri = photoUri ? await storePhoto(jar, photoUri) : null;
      await insertKid(jar, { name, photoUri: storedPhotoUri });
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
      <Pressable style={styles.photo} onPress={choosePhoto} accessibilityRole="button">
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoImage} />
        ) : (
          <Text style={styles.photoPlaceholder}>📷</Text>
        )}
      </Pressable>
      <Text style={styles.caption}>Tap to add a photo</Text>
      <PhotoSourceButtons onPhoto={setPhotoUri} />

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

const PHOTO_SIZE = 160;

const styles = StyleSheet.create({
  photo: {
    alignSelf: 'center',
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoPlaceholder: { fontSize: 56 },
  caption: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
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
