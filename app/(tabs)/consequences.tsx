import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '../../src/components/EmptyState';
import { HiddenWhenBlurred } from '../../src/components/HiddenWhenBlurred';
import { IconBadge } from '../../src/components/Icons';
import {
  listConsequences,
  removeConsequence,
  useFamilyJar,
  useJarVersion,
  type Consequence,
  type ConsequenceChange,
} from '../../src/db';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { useParentLock } from '../../src/parent/ParentLockProvider';
import { dayKey } from '../../src/tasks/day';
import { FadeInUp } from '../../src/components/Animations';
import { colors, fonts, offsetShadow, radius, shadow, spacing, typography, useLargeScreen } from '../../src/theme';

export default function ConsequencesTab() {
  return (
    <HiddenWhenBlurred>
      <ConsequencesScreen />
    </HiddenWhenBlurred>
  );
}

// Memoized: expo-router re-renders the tab's route on every tab switch, and
// on the frame redrawing a whole screen for that was most of the switch.
const ConsequencesScreen = memo(function ConsequencesScreen() {
  const jar = useFamilyJar();
  // Consequences logged or taken back on another device (WJ-50).
  const version = useJarVersion('consequences');
  const { activeKid, recordSavingsChange } = useActiveKid();
  const large = useLargeScreen();
  const columns = large ? 2 : 1;
  const kidId = activeKid?.id ?? null;
  const [consequences, setConsequences] = useState<Consequence[]>([]);
  const { requestPin, openParentScreen } = useParentLock();
  const [day, setDay] = useState(dayKey);

  // Entries are kept per day, so today's list is reloaded whenever the tab
  // is shown, including after adding one from the picker.
  useFocusEffect(
    useCallback(() => {
      if (kidId == null) {
        setConsequences([]);
        return;
      }
      let cancelled = false;
      const today = dayKey();
      setDay(today);
      listConsequences(jar, kidId, today).then(
        (loaded) => {
          if (!cancelled) setConsequences(loaded);
        },
        () => {},
      );
      return () => {
        cancelled = true;
      };
      // `version` loads again what another device changed.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jar, kidId, version]),
  );

  // Kids can see their consequences, but only a grown-up with the PIN can take one back.
  async function remove(consequence: Consequence) {
    if (kidId == null || !(await requestPin())) return;
    let change: ConsequenceChange;
    try {
      change = await removeConsequence(jar, {
        consequenceId: consequence.id,
        kidId,
        dayKey: day,
      });
    } catch {
      Alert.alert('Could not save', 'Something went wrong while saving. Please try again.');
      return;
    }
    if (change.changed) {
      recordSavingsChange(kidId, change.coins);
    }
    listConsequences(jar, kidId, day).then(setConsequences, () => {});
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        {activeKid ? (
          <FlatList
            // FlatList can't change its column count in place, so remount on change.
            key={columns}
            data={consequences}
            keyExtractor={(item) => String(item.id)}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? styles.columns : undefined}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.heading}>Today</Text>}
            ListEmptyComponent={
              <EmptyState emoji="😇" text="Nothing today. Keep it that way!" />
            }
            renderItem={({ item, index }) => (
              <FadeInUp index={index} style={columns > 1 && styles.cell}>
                <View style={styles.row}>
                  <IconBadge icon={item.icon} fallbackEmoji="⚖️" size={56} />
                  <Text style={styles.name}>{item.name}</Text>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>
                      {item.coinAmount === 0 ? 'No coins' : `−${item.coinAmount} 🪙`}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => remove(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                    hitSlop={8}
                  >
                    <Text style={[styles.remove, large && styles.removeLarge]}>✕</Text>
                  </Pressable>
                </View>
              </FadeInUp>
            )}
          />
        ) : (
          <EmptyState emoji="🧒" text="Ask a grown-up to add a kid first." />
        )}

        {activeKid ? (
          <Pressable
            style={[styles.button, large && styles.buttonLarge]}
            onPress={() => openParentScreen('/add-consequence')}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>🔒 Add a consequence</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.sm, flexGrow: 1 },
  columns: { gap: spacing.md },
  // Half the row each, so a lone last consequence stays the same size.
  cell: { flex: 1, maxWidth: '50%' },
  heading: { ...typography.title, color: colors.text, marginBottom: spacing.xs },
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
  name: { ...typography.body, fontSize: 18, color: colors.text, fontFamily: fonts.bold, flex: 1 },
  pill: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  pillText: { fontSize: 16, fontFamily: fonts.display, color: colors.accent },
  remove: { fontSize: 20, fontFamily: fonts.display, color: colors.textMuted, paddingHorizontal: spacing.xs },
  removeLarge: { fontSize: 30, padding: spacing.sm },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.surface,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
    ...offsetShadow(colors.primaryDark, 6),
  },
  buttonLarge: { alignSelf: 'center', minWidth: 420, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  buttonText: { ...typography.heading, color: colors.surface },
});
