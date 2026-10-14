import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconBadge } from '../../src/components/Icons';
import { listPunishments, removePunishment, useDatabase, type Punishment } from '../../src/db';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { useParentLock } from '../../src/parent/ParentLockProvider';
import { dayKey } from '../../src/tasks/day';
import { FadeInUp } from '../../src/components/Animations';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';

export default function PunishmentsScreen() {
  const db = useDatabase();
  const { activeKid, recordSavingsChange } = useActiveKid();
  const kidId = activeKid?.id ?? null;
  const [punishments, setPunishments] = useState<Punishment[]>([]);
  const { requestPin, openParentScreen } = useParentLock();
  const [day, setDay] = useState(dayKey);

  // Entries are kept per day, so today's list is reloaded whenever the tab
  // is shown, including after adding one from the picker.
  useFocusEffect(
    useCallback(() => {
      if (kidId == null) {
        setPunishments([]);
        return;
      }
      let cancelled = false;
      const today = dayKey();
      setDay(today);
      listPunishments(db, kidId, today).then((loaded) => {
        if (!cancelled) setPunishments(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [db, kidId]),
  );

  // Kids can see their punishments, but only a grown-up with the PIN can take one back.
  async function remove(punishment: Punishment) {
    if (kidId == null || !(await requestPin())) return;
    const change = await removePunishment(db, {
      punishmentId: punishment.id,
      kidId,
      dayKey: day,
    });
    if (change.changed) {
      recordSavingsChange(kidId, change.coins);
    }
    setPunishments(await listPunishments(db, kidId, day));
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        {activeKid ? (
          <FlatList
            data={punishments}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.heading}>Today</Text>}
            ListEmptyComponent={
              <View style={styles.card}>
                <Text style={styles.cardEmoji}>😇</Text>
                <Text style={styles.cardText}>Nothing today. Keep it that way!</Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <FadeInUp index={index}>
                <View style={styles.row}>
                  <IconBadge icon={item.icon} fallbackEmoji="🚫" size={56} />
                  <Text style={styles.name}>{item.name}</Text>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>−{item.coinAmount} 🪙</Text>
                  </View>
                  <Pressable
                    onPress={() => remove(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                    hitSlop={8}
                  >
                    <Text style={styles.remove}>✕</Text>
                  </Pressable>
                </View>
              </FadeInUp>
            )}
          />
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardEmoji}>🧒</Text>
            <Text style={styles.cardText}>Ask a grown-up to add a kid first.</Text>
          </View>
        )}

        {activeKid ? (
          <Pressable
            style={styles.button}
            onPress={() => openParentScreen('/add-punishment')}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>🔒 Add a punishment</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.sm, flexGrow: 1 },
  heading: { ...typography.heading, color: colors.text, marginBottom: spacing.sm },
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
  cardEmoji: { fontSize: 64 },
  cardText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow,
  },
  name: { ...typography.body, fontSize: 18, color: colors.text, fontWeight: '700', flex: 1 },
  pill: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  pillText: { fontSize: 16, fontWeight: '800', color: colors.accent },
  remove: { fontSize: 20, fontWeight: '800', color: colors.textMuted, paddingHorizontal: spacing.xs },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonText: { ...typography.heading, color: colors.surface },
});
