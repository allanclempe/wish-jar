import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getKid, updateKid, useDatabase } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { removePhoto, storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

export default function EditKidScreen() {
  const db = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();
  const kidId = Number(id);
  const { refreshKids } = useActiveKid();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [originalPhotoUri, setOriginalPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  useEffect(() => {
    let cancelled = false;
    getKid(db, kidId).then((kid) => {
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
  }, [db, kidId]);

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to your photos to change the picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    let savedPhotoUri = photoUri;
    try {
      if (photoUri && photoUri !== originalPhotoUri) {
        savedPhotoUri = await storePhoto(photoUri);
      }
      const previousPhotoUri = await updateKid(db, kidId, { name, photoUri: savedPhotoUri });
      if (previousPhotoUri !== savedPhotoUri) {
        removePhoto(previousPhotoUri);
      }
      await refreshKids();
      router.back();
    } catch {
      if (savedPhotoUri !== photoUri) {
        removePhoto(savedPhotoUri);
      }
      Alert.alert('Could not save', 'Something went wrong while saving. Please try again.');
      setSaving(false);
    }
  }

  if (!loaded) {
    return <SafeAreaView style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Pressable style={styles.photo} onPress={pickPhoto} accessibilityRole="button">
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoImage} />
          ) : (
            <Text style={styles.photoPlaceholder}>📷</Text>
          )}
        </Pressable>
        <Text style={styles.caption}>Tap to change the photo</Text>

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
      </View>
    </SafeAreaView>
  );
}

const PHOTO_SIZE = 160;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md, alignItems: 'stretch' },
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
