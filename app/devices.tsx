import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listDevices, removeDevice, useFamilyJar, type Device } from '../src/db';
import { addedOn, deviceEmoji, deviceName, seenAgo } from '../src/family/devices';
import {
  colors,
  contentMaxWidth,
  fonts,
  primaryShadow,
  radius,
  shadow,
  spacing,
  typography,
} from '../src/theme';

// Alert.alert does nothing on web, so the browser's own confirm stands in.
function confirmRemove(device: Device, onConfirm: () => void) {
  const title = `Remove ${deviceName(device)}?`;
  const message =
    "It won't open the family jar any more. To use it again, add it again with a new code.";
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

// Every device sharing the family jar (WJ-48): add one with a code, or remove
// one that's lost. This device can't remove itself.
export default function DevicesScreen() {
  const jar = useFamilyJar();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setDevices(await listDevices(jar));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [jar]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function remove(device: Device) {
    try {
      await removeDevice(jar, device.id);
    } catch {
      Alert.alert('Could not remove it', 'Something went wrong. Please try again.');
    }
    await load();
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <FlatList
          data={devices ?? []}
          keyExtractor={(device) => String(device.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.intro}>
              These share the family&apos;s jar: kids, tasks, wishes and coins. Remove one that&apos;s
              lost, and it can&apos;t open the jar any more.
            </Text>
          }
          ListEmptyComponent={
            failed ? (
              <Text style={styles.intro}>Couldn&apos;t load the devices. Go back and try again.</Text>
            ) : (
              <ActivityIndicator color={colors.primary} style={styles.loading} />
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.row, item.thisDevice && styles.rowThis]}>
              <View style={styles.icon}>
                <Text style={styles.iconEmoji}>{deviceEmoji(item)}</Text>
              </View>
              <View style={styles.text}>
                <Text style={styles.name}>{deviceName(item)}</Text>
                <Text style={styles.subtitle}>
                  Added {addedOn(item.addedAt)} ·{' '}
                  {item.thisDevice ? 'this one' : `seen ${seenAgo(item.lastSeenAt)}`}
                </Text>
              </View>
              {item.thisDevice ? (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>This device</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.remove}
                  onPress={() => confirmRemove(item, () => remove(item))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${deviceName(item)}`}
                  hitSlop={8}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              )}
            </View>
          )}
        />

        <Pressable
          style={styles.button}
          onPress={() => router.push('/add-device')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>＋ Add a device</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/join-family')}
          accessibilityRole="button"
          hitSlop={12}
        >
          <Text style={styles.link}>Join another family&apos;s jar instead</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const ICON_SIZE = 56;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: contentMaxWidth,
    alignSelf: 'center',
  },
  list: { gap: spacing.md, flexGrow: 1 },
  intro: { ...typography.body, color: colors.textMuted },
  loading: { padding: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow,
  },
  rowThis: { borderColor: colors.success },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 28 },
  text: { flex: 1, gap: 2 },
  name: { ...typography.heading, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted },
  pill: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
  },
  pillText: { ...typography.caption, color: colors.surface, fontFamily: fonts.bold },
  remove: {
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  removeText: { ...typography.caption, color: colors.accent, fontFamily: fonts.bold },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...primaryShadow,
  },
  buttonText: { ...typography.heading, color: colors.surface },
  link: {
    ...typography.body,
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
