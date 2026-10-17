import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeleteButton } from '../src/components/DeleteButton';
import { ScrollScreen } from '../src/components/ScrollScreen';
import { IconPicker } from '../src/components/Icons';
import { PeriodPicker } from '../src/components/PeriodPicker';
import {
  deleteTask,
  discardPhoto,
  getTask,
  updateTask,
  useFamilyJar,
  type Icon,
  type Period,
} from '../src/db';
import { storePhoto } from '../src/photos/photos';
import { colors, radius, spacing, typography } from '../src/theme';

type Errors = { name?: string; coinAmount?: string };

export default function EditTaskScreen() {
  const jar = useFamilyJar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = Number(id);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [period, setPeriod] = useState<Period>('morning');
  const [coinAmount, setCoinAmount] = useState('');
  const [icon, setIcon] = useState<Icon>({ emoji: null, photoUri: null });
  const [originalPhotoUri, setOriginalPhotoUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTask(jar, taskId).then(
      (task) => {
        if (cancelled) return;
        if (!task) {
          Alert.alert('Task not found', 'This task may have been removed.');
          router.back();
          return;
        }
        setName(task.name);
        setPeriod(task.period);
        setCoinAmount(String(task.coinAmount));
        setIcon(task.icon);
        setOriginalPhotoUri(task.icon.photoUri);
        setLoaded(true);
      },
      // A failed load shows on the jar's reconnecting screen.
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [jar, taskId]);

  function validate(): Errors {
    const next: Errors = {};
    if (name.trim().length === 0) {
      next.name = 'Give the task a name.';
    }
    const coins = coinAmount.trim();
    if (!/^\d+$/.test(coins) || Number(coins) === 0) {
      next.coinAmount = 'Coins must be a whole number, 1 or more.';
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
        savedPhotoUri = await storePhoto(jar, icon.photoUri);
      }
      await updateTask(jar, taskId, {
        name,
        period,
        coinAmount: Number(coinAmount.trim()),
        icon: { emoji: icon.emoji, photoUri: savedPhotoUri },
      });
      router.back();
    } catch {
      if (savedPhotoUri !== icon.photoUri) {
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
      await deleteTask(jar, taskId);
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

      <Text style={styles.label}>When</Text>
      <PeriodPicker value={period} onChange={setPeriod} />

      <Text style={styles.label}>Coins earned</Text>
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

      <Pressable
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={save}
        disabled={saving}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>
      <DeleteButton
        label="Delete task"
        title={`Delete "${name.trim() || 'this task'}"?`}
        message="It comes off every kid's list for good. Coins already earned from it stay in their savings."
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
