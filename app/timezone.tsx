import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  currentTimeZone,
  setFrameTimeZone,
  timeZoneName,
  timeZoneOffset,
  timeZones,
} from '../src/device/frame';
import { colors, contentMaxWidth, radius, spacing, typography } from '../src/theme';

export default function TimeZoneScreen() {
  const [current] = useState(currentTimeZone);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // The current timezone first, then the rest by name.
  const zones = useMemo(() => {
    const all = timeZones()
      .map((zone) => ({ zone, name: timeZoneName(zone) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found = all.filter(({ zone, name }) => {
      const text = `${name} ${zone.replace(/_/g, ' ')}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    return [...found.filter(({ zone }) => zone === current), ...found.filter(({ zone }) => zone !== current)];
  }, [search, current]);

  async function pick(zone: string) {
    if (zone === current) {
      router.back();
      return;
    }
    setSaving(zone);
    setFailed(false);
    try {
      await setFrameTimeZone(zone);
      router.back();
    } catch {
      setFailed(true);
    } finally {
      setSaving(null);
    }
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.subtitle}>
          Each day&apos;s tasks start again at midnight in this timezone. The frame works it out from
          its internet connection; pick another if that got it wrong.
        </Text>
        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder="Search for a city, e.g. Brisbane"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {failed ? <Text style={styles.error}>Couldn&apos;t change the timezone. Try again.</Text> : null}
        <FlatList
          data={zones}
          keyExtractor={({ zone }) => zone}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          ListEmptyComponent={<Text style={styles.empty}>No timezone matches “{search.trim()}”.</Text>}
          renderItem={({ item }) => {
            const isCurrent = item.zone === current;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  isCurrent && styles.rowCurrent,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => pick(item.zone)}
                disabled={saving != null}
                accessibilityRole="button"
                accessibilityState={{ selected: isCurrent }}
              >
                <View style={styles.rowText}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.offset}>{timeZoneOffset(item.zone)}</Text>
                </View>
                {isCurrent ? <Text style={styles.check}>✓</Text> : null}
                {saving === item.zone ? <Text style={styles.saving}>Saving…</Text> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md, width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted },
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
  error: { ...typography.caption, color: colors.accent },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  rowCurrent: { borderColor: colors.success },
  rowPressed: { opacity: 0.8 },
  rowText: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: '700', color: colors.text },
  offset: { ...typography.caption, color: colors.textMuted },
  check: { fontSize: 24, fontWeight: '800', color: colors.successDark },
  saving: { ...typography.caption, color: colors.textMuted },
});
