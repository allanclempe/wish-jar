import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconBadge } from '../src/components/Icons';
import {
  addConsequence,
  listConsequenceTypes,
  useDatabase,
  type ConsequenceType,
} from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { dayKey } from '../src/tasks/day';
import { colors, radius, spacing, typography } from '../src/theme';

export default function AddConsequenceScreen() {
  const db = useDatabase();
  const { activeKid, recordSavingsChange } = useActiveKid();
  const [types, setTypes] = useState<ConsequenceType[]>([]);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listConsequenceTypes(db).then((loaded) => {
        if (!cancelled) setTypes(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  async function choose(type: ConsequenceType) {
    if (!activeKid || saving) return;
    setSaving(true);
    try {
      const change = await addConsequence(db, {
        kidId: activeKid.id,
        consequenceType: type,
        dayKey: dayKey(),
      });
      if (change.changed) {
        recordSavingsChange(activeKid.id, -change.coins);
      }
      router.back();
    } catch {
      Alert.alert('Could not save', 'Something went wrong while saving. Please try again.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <FlatList
        data={types}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.card}>
            <Text style={styles.cardEmoji}>⚖️</Text>
            <Text style={styles.cardText}>
              No consequences yet. Add some in Settings, then come back here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => choose(item)}
            disabled={saving}
            accessibilityRole="button"
          >
            <IconBadge icon={item.icon} fallbackEmoji="⚖️" />
            <Text style={styles.name}>{item.name}</Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {item.coinAmount === 0
                  ? 'No coins'
                  : `−${item.coinAmount} ${item.coinAmount === 1 ? 'coin' : 'coins'}`}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { gap: spacing.sm, padding: spacing.lg, flexGrow: 1 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: { fontSize: 48 },
  cardText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowPressed: { backgroundColor: colors.border },
  name: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  pill: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.accent },
});
