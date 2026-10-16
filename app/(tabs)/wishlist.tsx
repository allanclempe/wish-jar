import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Celebration, FadeInUp, Wiggle } from '../../src/components/Animations';
import { EmptyState } from '../../src/components/EmptyState';
import { IconBadge } from '../../src/components/Icons';
import { ProgressBar } from '../../src/components/ProgressBar';
import { claimWish, listWishes, useDatabase, type Wish } from '../../src/db';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { useParentLock } from '../../src/parent/ParentLockProvider';
import { colors, fonts, radius, shadow, spacing, typography, useLargeScreen } from '../../src/theme';
import { orderWishes } from '../../src/wishes/order';

export default function WishlistScreen() {
  const db = useDatabase();
  const { activeKid, savings, recordSavingsChange } = useActiveKid();
  const large = useLargeScreen();
  const { requestPin } = useParentLock();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [burst, setBurst] = useState(0);
  const [claiming, setClaiming] = useState(false);

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

  // An unlocked wish is handed over by a grown-up, who confirms with the PIN
  // before its coins come out of the kid's savings.
  async function claim(wish: Wish) {
    if (!activeKid || claiming) return;
    const kidId = activeKid.id;
    setClaiming(true);
    try {
      const confirmed = await requestPin({
        emoji: '🎁',
        title: 'Bring the phone to your grown-up!',
        subtitle: `Grown-up: type the PIN to give ${activeKid.name} "${wish.name}" for 🪙 ${wish.coinAmount}.`,
      });
      if (!confirmed) return;
      const result = await claimWish(db, { wishId: wish.id, kidId });
      if (!result.changed) {
        Alert.alert('Not enough coins', 'This wish needs more coins before it can be claimed.');
        return;
      }
      recordSavingsChange(kidId, -result.coins);
      setWishes(await listWishes(db));
      setBurst((count) => count + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } finally {
      setClaiming(false);
    }
  }

  function nudgeLocked() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }

  const coins = activeKid ? (savings[activeKid.id] ?? 0) : 0;
  const columns = large ? 4 : 2;
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
        // FlatList can't change its column count in place, so remount on change.
        key={columns}
        numColumns={columns}
        style={styles.listView}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.column}
        ListHeaderComponent={
          activeKid ? <Text style={styles.heading}>{`🌟 ${activeKid.name}'s wishes`}</Text> : null
        }
        ListEmptyComponent={
          <EmptyState
            emoji="🎁"
            text="No wishes yet. Ask a grown-up to add one so you can start saving coins!"
          />
        }
        renderItem={({ item: { wish, state, coinsStillNeeded, progress }, index }) => {
          const unlocked = state === 'unlocked';
          const locked = state === 'locked';
          const claimed = state === 'claimed';
          return (
            <FadeInUp index={index} style={[styles.cell, { maxWidth: `${100 / columns}%` }]}>
              <Pressable
                style={({ pressed }) => [
                  styles.wish,
                  unlocked && styles.wishReady,
                  claimed && styles.wishClaimed,
                  pressed && !claimed && styles.pressed,
                ]}
                onPress={unlocked ? () => claim(wish) : locked ? nudgeLocked : undefined}
                disabled={claimed}
                accessibilityRole="button"
                accessibilityLabel={
                  unlocked
                    ? `${wish.name}, unlocked. Tap to get it.`
                    : claimed
                      ? `${wish.name}, you got it`
                      : `${wish.name}, locked. ${coinsStillNeeded} coins to go.`
                }
              >
                <Wiggle active={unlocked}>
                  <View style={locked && styles.iconLocked}>
                    <IconBadge icon={wish.icon} fallbackEmoji="🎁" size={84} />
                  </View>
                  {locked || claimed ? (
                    <View style={[styles.badge, claimed && styles.badgeClaimed]}>
                      <Text style={styles.badgeText}>{claimed ? '✅' : '🔒'}</Text>
                    </View>
                  ) : null}
                </Wiggle>
                <Text style={[styles.name, locked && styles.nameLocked]} numberOfLines={2}>
                  {wish.name}
                </Text>
                {claimed ? null : (
                  <View style={styles.progress}>
                    <ProgressBar progress={progress} />
                  </View>
                )}
                <Text
                  style={[
                    styles.needed,
                    unlocked && styles.neededReady,
                    claimed && styles.neededClaimed,
                  ]}
                >
                  {unlocked ? 'Tap to get it! 🎉' : claimed ? 'Got it!' : `🪙 ${coinsStillNeeded} to go`}
                </Text>
              </Pressable>
            </FadeInUp>
          );
        }}
      />
      <Celebration burst={burst} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  listView: { flex: 1 },
  list: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  column: { gap: spacing.md },
  heading: { ...typography.title, color: colors.text, marginBottom: spacing.xs },
  // An equal share of the row each, so a lone last wish stays about the same size.
  cell: { flex: 1 },
  wish: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 4,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow,
  },
  wishReady: { borderColor: colors.sunshine, backgroundColor: '#FFFBEA' },
  wishClaimed: { borderColor: colors.success, backgroundColor: '#F0FBF4' },
  pressed: { transform: [{ scale: 0.97 }] },
  iconLocked: { opacity: 0.4 },
  // Sits on the icon's bottom-right corner.
  badge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeClaimed: { borderColor: colors.success },
  badgeText: { fontSize: 16 },
  name: { ...typography.body, fontFamily: fonts.display, color: colors.text, textAlign: 'center', minHeight: 44 },
  nameLocked: { color: colors.textMuted },
  progress: { alignSelf: 'stretch' },
  needed: { ...typography.caption, fontFamily: fonts.bold, color: colors.textMuted },
  neededReady: { color: colors.successDark, fontSize: 16 },
  neededClaimed: { color: colors.successDark, fontSize: 16 },
});
