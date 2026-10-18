import * as Haptics from 'expo-haptics';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Celebration, FadeInUp } from '../../src/components/Animations';
import { EmptyState } from '../../src/components/EmptyState';
import { HiddenWhenBlurred } from '../../src/components/HiddenWhenBlurred';
import { IconBadge } from '../../src/components/Icons';
import { DreamSky } from '../../src/components/Sky';
import { WishCard } from '../../src/components/WishCard';
import { claimWish, listWishes, useFamilyJar, useJarVersion, type Wish } from '../../src/db';
import { useActiveKid, useSavings } from '../../src/kids/ActiveKidProvider';
import { useParentLock } from '../../src/parent/ParentLockProvider';
import { useSound } from '../../src/sound/SoundProvider';
import { colors, dreamSky, fonts, radius, spacing, typography, useLargeScreen } from '../../src/theme';
import { orderWishes, sameWishes, type WishProgress } from '../../src/wishes/order';

// The hero card: as wide as the list, wider than tall, and capped on the
// frame so the closest wish does not swallow the screen.
const HERO_HEIGHT = 250;
const HERO_HEIGHT_LARGE = 340;
const HERO_MAX_WIDTH = 760;
// The grid tiles stand a little taller than wide, like the task tiles.
const TILE_ASPECT = 0.8;

export default function WishlistTab() {
  return (
    <HiddenWhenBlurred>
      <WishlistScreen />
    </HiddenWhenBlurred>
  );
}

// Memoized: expo-router re-renders the tab's route on every tab switch, and
// on the frame redrawing a whole screen for that was most of the switch.
const WishlistScreen = memo(function WishlistScreen() {
  const { activeKid } = useActiveKid();
  const savings = useSavings();
  const focused = useIsFocused();
  const liveCoins = activeKid ? (savings[activeKid.id] ?? 0) : 0;
  // While another tab is in front the board keeps the coins it last showed,
  // so a tick doesn't re-render every hidden wish card; it catches up as the
  // tab comes back, before it shows.
  const [coins, setCoins] = useState(liveCoins);
  if (focused && coins !== liveCoins) setCoins(liveCoins);
  return <WishBoard coins={coins} />;
});

const WishBoard = memo(function WishBoard({ coins }: { coins: number }) {
  const jar = useFamilyJar();
  // Wishes a grown-up changed on another device show once this tab is in
  // front (WJ-50).
  const version = useJarVersion('wishes');
  const { activeKid, recordSavingsChange } = useActiveKid();
  const large = useLargeScreen();
  const { requestPin } = useParentLock();
  const { playTap, playLocked } = useSound();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [burst, setBurst] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listWishes(jar).then(
        (loaded) => {
          if (!cancelled) setWishes((current) => (sameWishes(current, loaded) ? current : loaded));
        },
        () => {},
      );
      return () => {
        cancelled = true;
      };
      // `version` loads again what another device changed.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jar, version]),
  );

  // An unlocked wish is handed over by a grown-up, who confirms with the PIN
  // (or a tap, while no PIN is set) before its coins come out of the kid's
  // savings.
  async function claim(wish: Wish) {
    playTap();
    if (!activeKid || claiming) return;
    const kidId = activeKid.id;
    setClaiming(true);
    try {
      const confirmed = await requestPin({
        emoji: '🎁',
        title: 'Bring the phone to your grown-up!',
        subtitle: `Grown-up: type the PIN to give ${activeKid.name} "${wish.name}" for 🪙 ${wish.coinAmount}.`,
        noPinSubtitle: `Grown-up: give ${activeKid.name} "${wish.name}" for 🪙 ${wish.coinAmount}?`,
        confirm: 'Give it',
      });
      if (!confirmed) return;
      const result = await claimWish(jar, { wishId: wish.id, kidId });
      if (!result.changed) {
        Alert.alert('Not enough coins', 'This wish needs more coins before it can be claimed.');
        return;
      }
      recordSavingsChange(kidId, -result.coins);
      setWishes(await listWishes(jar));
      setBurst((count) => count + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      Alert.alert('Could not save', 'Something went wrong while saving. Please try again.');
    } finally {
      setClaiming(false);
    }
  }

  function nudgeLocked() {
    playLocked();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }

  function pressFor({ wish, state }: WishProgress) {
    return state === 'unlocked' ? () => claim(wish) : state === 'locked' ? nudgeLocked : undefined;
  }

  const columns = large ? 4 : 2;
  const ordered = useMemo(() => {
    if (!activeKid) return [];
    const kidWishes = wishes.filter((wish) => wish.kidId === activeKid.id);
    return orderWishes(kidWishes, coins);
  }, [wishes, activeKid, coins]);
  // Closest first, so the first open wish is the hero and the claimed ones,
  // which orderWishes puts last, go on the shelf.
  const open = ordered.filter(({ state }) => state !== 'claimed');
  const claimed = ordered.filter(({ state }) => state === 'claimed');
  const [hero, ...rest] = open;
  const gutter = large ? spacing.lg : spacing.md;

  // The sky fills the whole tab, under the safe area too; the list keeps its
  // own gutter.
  return (
    <View style={styles.container}>
      <DreamSky />
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
        <FlatList
          data={rest}
          keyExtractor={({ wish }) => String(wish.id)}
          // FlatList can't change its column count in place, so remount on change.
          key={columns}
          numColumns={columns}
          style={styles.listView}
          contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
          columnWrapperStyle={styles.column}
          ListHeaderComponent={
            activeKid ? (
              <View style={styles.header}>
                <Text style={[styles.heading, large && styles.headingLarge]}>{`🌟 ${activeKid.name}'s wishes`}</Text>
                {hero ? (
                  <FadeInUp style={[styles.hero, { height: large ? HERO_HEIGHT_LARGE : HERO_HEIGHT }]}>
                    <WishCard {...hero} hero large={large} onPress={pressFor(hero)} style={styles.fill} />
                  </FadeInUp>
                ) : null}
              </View>
            ) : null
          }
          ListEmptyComponent={
            ordered.length === 0 ? (
              <EmptyState
                emoji="🎁"
                text="No wishes yet. Ask a grown-up to add one so you can start saving coins!"
                textColor={dreamSky.subtitle}
              />
            ) : null
          }
          ListFooterComponent={
            claimed.length > 0 ? (
              <View style={styles.shelf}>
                <Pressable
                  onPress={() => setShelfOpen((wasOpen) => !wasOpen)}
                  style={({ pressed }) => [styles.shelfToggle, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: shelfOpen }}
                  accessibilityLabel={`Got it, ${claimed.length} ${claimed.length === 1 ? 'wish' : 'wishes'}`}
                >
                  <Text style={[styles.shelfTitle, large && styles.shelfTitleLarge]}>Got it 🏆</Text>
                  <View style={styles.shelfCount}>
                    <Text style={styles.shelfCountText}>{claimed.length}</Text>
                  </View>
                  <Text style={[styles.shelfChevron, shelfOpen && styles.shelfChevronOpen]}>›</Text>
                </Pressable>
                {shelfOpen ? (
                  <View style={styles.shelfRow}>
                    {claimed.map(({ wish }) => (
                      <View
                        key={wish.id}
                        style={[styles.thumb, large && styles.thumbLarge]}
                        accessible
                        accessibilityLabel={`${wish.name}, you got it`}
                      >
                        <IconBadge icon={wish.icon} fallbackEmoji="🎁" size={large ? 72 : 56} />
                        <Text style={[styles.thumbName, large && styles.thumbNameLarge]} numberOfLines={2}>
                          {wish.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            // An equal share of the row each, so a lone last wish stays the same size.
            <FadeInUp index={index + 1} style={[styles.cell, { maxWidth: `${100 / columns}%` }]}>
              <WishCard {...item} index={index} large={large} onPress={pressFor(item)} style={styles.tile} />
            </FadeInUp>
          )}
        />
      </SafeAreaView>
      <Celebration burst={burst} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  fill: { flex: 1 },
  listView: { flex: 1 },
  // Tilted tiles poke a few pixels past the grid, so the gutter stays off the
  // list itself and the rows keep a little room.
  list: { flexGrow: 1, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  column: { gap: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  heading: { ...typography.hero, color: dreamSky.title },
  headingLarge: { fontSize: 44, lineHeight: 52 },
  hero: { width: '100%', maxWidth: HERO_MAX_WIDTH, alignSelf: 'center' },
  cell: { flex: 1 },
  tile: { aspectRatio: TILE_ASPECT },
  pressed: { transform: [{ scale: 0.97 }] },
  // Claimed wishes, folded away under the grid: a trophy row that opens into
  // a line of little thumbnails.
  shelf: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  shelfToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  shelfTitle: { ...typography.heading, color: dreamSky.title, flex: 1 },
  shelfTitleLarge: { fontSize: 26, lineHeight: 32 },
  shelfCount: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.sunshine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shelfCountText: { fontFamily: fonts.display, fontSize: 17, lineHeight: 22, color: colors.text },
  shelfChevron: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 36,
    color: dreamSky.subtitle,
    transform: [{ rotate: '90deg' }],
  },
  shelfChevronOpen: { transform: [{ rotate: '-90deg' }] },
  shelfRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.xs },
  thumb: { width: 84, alignItems: 'center', gap: spacing.xs },
  thumbLarge: { width: 104 },
  thumbName: { ...typography.caption, fontFamily: fonts.semibold, color: dreamSky.title, textAlign: 'center' },
  thumbNameLarge: { fontSize: 16 },
});
