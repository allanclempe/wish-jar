import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeleteButton } from '../src/components/DeleteButton';
import { ScrollScreen } from '../src/components/ScrollScreen';
import { deleteKid, discardPhoto, getKid, updateKid, useFamilyJar } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { PhotoSourceButtons, usePickPhoto } from '../src/photos/PhotoPicker';
import { shownPhoto, storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

export default function EditKidScreen() {
  const jar = useFamilyJar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const kidId = Number(id);
  const { refreshKids } = useActiveKid();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [originalPhotoUri, setOriginalPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pickPhoto = usePickPhoto();

  const canSave = name.trim().length > 0 && !saving;

  useEffect(() => {
    let cancelled = false;
    getKid(jar, kidId).then((kid) => {
      if (cancelled) return;
      if (!kid) {
        Alert.alert('Kid not found', 'This kid may have been removed.');
        router.back();
        return;
      }
      setName(kid.name);
      setPhotoUri(kid.photoUri);
      setOriginalPhotoUri(kid.photoUri);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [jar, kidId]);

  async function choosePhoto() {
    const uri = await pickPhoto();
    if (uri) setPhotoUri(uri);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    let savedPhotoUri = photoUri;
    try {
      if (photoUri && photoUri !== originalPhotoUri) {
        savedPhotoUri = await storePhoto(jar, photoUri);
      }
      await updateKid(jar, kidId, { name, photoUri: savedPhotoUri });
      await refreshKids();
      router.back();
    } catch {
      if (savedPhotoUri !== photoUri) {
        discardPhoto(jar, savedPhotoUri);
      }
      Alert.alert('Could not save', 'Something went wrong while saving. Please try again.');
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

  const shownPhotoUri = shownPhoto(photoUri);

  if (!loaded) {
    return <SafeAreaView style={styles.safe} />;
  }

  return (
    <ScrollScreen>
      <Pressable style={styles.photo} onPress={choosePhoto} accessibilityRole="button">
        {shownPhotoUri ? (
          <Image source={{ uri: shownPhotoUri }} style={styles.photoImage} />
        ) : (
          <Text style={styles.photoPlaceholder}>📷</Text>
        )}
      </Pressable>
      <Text style={styles.caption}>Tap to change the photo</Text>
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

const PHOTO_SIZE = 160;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
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
