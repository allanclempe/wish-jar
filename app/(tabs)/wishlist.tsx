import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FadeInUp, Wiggle } from '../../src/components/Animations';
import { IconBadge } from '../../src/components/Icons';
import { ProgressBar } from '../../src/components/ProgressBar';
import { listWishes, useDatabase, type Wish } from '../../src/db';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';
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
      <FlatList
        data={ordered}
        keyExtractor={({ wish }) => String(wish.id)}
        numColumns={2}
        style={styles.listView}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.column}
        ListHeaderComponent={
          activeKid ? <Text style={styles.heading}>{`🌟 ${activeKid.name}'s wishes`}</Text> : null
        }
        ListEmptyComponent={
          <View style={styles.card}>
            <Text style={styles.cardEmoji}>🎁</Text>
            <Text style={styles.cardText}>
              No wishes yet. Ask a grown-up to add one so you can start saving coins!
            </Text>
          </View>
        }
        renderItem={({ item: { wish, coinsStillNeeded, progress }, index }) => {
          const ready = coinsStillNeeded === 0;
          return (
            <FadeInUp index={index} style={styles.cell}>
              <View style={[styles.wish, ready && styles.wishReady]}>
                <Wiggle active={ready}>
                  <IconBadge icon={wish.icon} fallbackEmoji="🎁" size={84} />
                </Wiggle>
                <Text style={styles.name} numberOfLines={2}>
                  {wish.name}
                </Text>
                <View style={styles.progress}>
                  <ProgressBar progress={progress} />
                </View>
                <Text style={[styles.needed, ready && styles.neededReady]}>
                  {ready ? 'Ready! 🎉' : `🪙 ${coinsStillNeeded} to go`}
                </Text>
              </View>
            </FadeInUp>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  listView: { flex: 1 },
  list: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  column: { gap: spacing.md },
  heading: { ...typography.title, color: colors.text, marginBottom: spacing.xs },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  cardEmoji: { fontSize: 64 },
  cardText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  // Half the row each, so a lone last wish stays about the same size.
  cell: { flex: 1, maxWidth: '50%' },
  wish: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow,
  },
  wishReady: { borderColor: colors.sunshine, backgroundColor: '#FFFBEA' },
  name: { ...typography.body, fontWeight: '800', color: colors.text, textAlign: 'center', minHeight: 44 },
  progress: { alignSelf: 'stretch' },
  needed: { ...typography.caption, fontWeight: '700', color: colors.textMuted },
  neededReady: { color: colors.successDark, fontSize: 16 },
});
