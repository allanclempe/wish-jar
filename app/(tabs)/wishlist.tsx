import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconBadge } from '../../src/components/Icons';
import { ProgressBar } from '../../src/components/ProgressBar';
import { listWishes, useDatabase, type Wish } from '../../src/db';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import { orderWishes } from '../../src/wishes/order';

export default function WishlistScreen() {
  const db = useDatabase();
  const { activeKid, savings } = useActiveKid();
  const [wishes, setWishes] = useState<Wish[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listWishes(db).then((loaded) => {
        if (!cancelled) setWishes(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  const coins = activeKid ? (savings[activeKid.id] ?? 0) : 0;
  const ordered = useMemo(() => {
    if (!activeKid) return [];
    const kidWishes = wishes.filter((wish) => wish.kidId === activeKid.id);
    return orderWishes(kidWishes, coins);
  }, [wishes, activeKid, coins]);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <FlatList
          data={ordered}
          keyExtractor={({ wish }) => String(wish.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            activeKid ? <Text style={styles.heading}>{`${activeKid.name}'s wishes`}</Text> : null
          }
          ListEmptyComponent={
            <View style={styles.card}>
              <Text style={styles.cardEmoji}>🎁</Text>
              <Text style={styles.cardText}>
                No wishes yet. Ask a grown-up to add one so kids can start saving coins!
              </Text>
            </View>
          }
          renderItem={({ item: { wish, coinsStillNeeded, progress } }) => (
            <View style={styles.row}>
              <IconBadge icon={wish.icon} fallbackEmoji="🎁" />
              <View style={styles.details}>
                <Text style={styles.name}>{wish.name}</Text>
                <Text style={styles.needed}>
                  {coinsStillNeeded === 0
                    ? 'Ready to get! 🎉'
                    : `🪙 ${coinsStillNeeded} more ${coinsStillNeeded === 1 ? 'coin' : 'coins'} to go`}
                </Text>
                <ProgressBar progress={progress} />
              </View>
            </View>
          )}
          ItemSeparatorComponent={Separator}
        />

      </View>
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  list: { flexGrow: 1 },
  heading: { ...typography.heading, color: colors.text, marginBottom: spacing.sm },
  separator: { height: spacing.sm },
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
  details: { flex: 1, gap: spacing.xs },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  needed: { ...typography.caption, color: colors.textMuted },
});
