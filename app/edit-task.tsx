import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconPicker } from '../src/components/Icons';
import { getTask, updateTask, useDatabase, type Icon } from '../src/db';
import { removePhoto, storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

type Errors = { name?: string; coinAmount?: string };

export default function EditTaskScreen() {
  const db = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = Number(id);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [coinAmount, setCoinAmount] = useState('');
  const [icon, setIcon] = useState<Icon>({ emoji: null, photoUri: null });
  const [originalPhotoUri, setOriginalPhotoUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTask(db, taskId).then((task) => {
      if (cancelled) return;
      if (!task) {
        Alert.alert('Task not found', 'This task may have been removed.');
        router.back();
        return;
      }
      setName(task.name);
      setCoinAmount(String(task.coinAmount));
      setIcon(task.icon);
      setOriginalPhotoUri(task.icon.photoUri);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [db, taskId]);

  function validate(): Errors {
    const next: Errors = {};
    if (name.trim().length === 0) {
      next.name = 'Give the task a name.';
    }
    const coins = coinAmount.trim();
    if (!/^-?\d+$/.test(coins) || Number(coins) === 0) {
      next.coinAmount = 'Coins must be a whole number, positive or negative.';
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
      const previousPhotoUri = await updateTask(db, taskId, {
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

  if (!loaded) {
    return <SafeAreaView style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <IconPicker value={icon} fallbackEmoji="🧹" onChange={setIcon} />

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

        <Text style={styles.label}>Coins earned (use - for a penalty)</Text>
        <TextInput
          style={styles.input}
          value={coinAmount}
          onChangeText={(text) => {
            setCoinAmount(text);
            setErrors((prev) => ({ ...prev, coinAmount: undefined }));
          }}
          placeholder="e.g. 5"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
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
