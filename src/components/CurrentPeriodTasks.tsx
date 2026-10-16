import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import {
  listCompletedTaskIds,
  listTasks,
  listWishes,
  setTaskCompletion,
  useDatabase,
  type Task,
} from '../db';
import { useActiveKid } from '../kids/ActiveKidProvider';
import { colors, fonts, radius, spacing, typography, useLargeScreen } from '../theme';
import { currentPeriod, PERIOD_EMOJIS, PERIOD_LABELS, tasksForPeriod } from '../tasks/period';
import { dayKey } from '../tasks/day';
import { wishesUnlockedBy } from '../wishes/order';
import { Celebration, FadeInUp } from './Animations';
import { EmptyState } from './EmptyState';
import { TaskCard } from './TaskCard';

const PERIOD_CHECK_INTERVAL_MS = 60_000;
const GRID_GAP = spacing.md;
// Tilted tiles poke a few pixels past the grid; the ScrollView would clip them.
const GRID_PAD = spacing.sm;
// How tall or wide a tile may get while fitting the screen, as width / height;
// past these the grid scrolls instead.
const TALLEST_TILE = 0.68;
const WIDEST_TILE = 1.4;

// Kids have three or four tasks per period, so the tiles are big. Phones show
// two columns and three once there are five tasks; the frame shows a row of up
// to four, two rows up to eight and scrolls from nine.
export function gridColumns(count: number, large: boolean): number {
  if (large) return count <= 4 ? Math.max(count, 1) : 4;
  return count <= 4 ? 2 : 3;
}

// The grid fits the screen on a phone with up to four tasks and on the frame
// with up to eight; more than that scrolls.
export function gridFits(count: number, large: boolean): boolean {
  return count <= (large ? 8 : 4);
}

type GridMetrics = { columns: number; tileWidth: number; tileHeight: number };

// Tiles share the width; their height fits the space, between tall and wide.
export function gridMetrics(
  count: number,
  large: boolean,
  width: number,
  height: number,
): GridMetrics {
  const columns = gridColumns(count, large);
  const rows = Math.max(1, Math.ceil(count / columns));
  const fullWidth = Math.floor((width - GRID_GAP * (columns - 1)) / columns);
  const tallest = fullWidth / TALLEST_TILE;
  const fits = gridFits(count, large) && height > 0;
  const fitted = fits ? (height - GRID_GAP * (rows - 1)) / rows : tallest;
  const tileHeight = Math.floor(Math.min(tallest, fitted));
  // A lone task on the frame would otherwise stretch across the screen and
  // grow taller than it: a fitting tile gives up width before it stops fitting,
  // and the row centres it.
  const tileWidth = fits ? Math.min(fullWidth, Math.floor(tileHeight * WIDEST_TILE)) : fullWidth;
  return { columns, tileWidth, tileHeight };
}
// Lets the tick's coin float and confetti play before the achievement opens.
const UNLOCK_DELAY_MS = 900;

export function CurrentPeriodTasks() {
  const db = useDatabase();
  const { activeKid, recordTaskCompletion } = useActiveKid();
  const large = useLargeScreen();
  const activeKidId = activeKid?.id ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(currentPeriod);
  const [day, setDay] = useState(dayKey);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(() => new Set());
  // Read and written synchronously so rapid taps see each other before re-render.
  const doneRef = useRef(new Set<string>());
  // The kid and day whose saved ticks are loaded; taps wait until they match.
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Wishes unlocked by quick ticks in a row open together on one screen, keyed
  // by id with their coin amount so an un-tick before it opens can drop them.
  const pendingUnlocks = useRef(new Map<number, number>());
  // The space the grid may fill: the list minus the banner above it.
  const [listSize, setListSize] = useState({ width: 0, height: 0 });
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(
    () => () => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
    },
    [],
  );

  // Ticks are keyed by day, so once the day key changes no task looks done.
  const refreshClock = useCallback(() => {
    setPeriod(currentPeriod());
    setDay(dayKey());
  }, []);

  useEffect(() => {
    const timer = setInterval(refreshClock, PERIOD_CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshClock();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refreshClock]);

  // Tasks are shared across kids today, so activeKidId only triggers a reload
  // when the selected kid changes.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      listTasks(db).then((loaded) => {
        if (cancelled) return;
        setTasks(loaded);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, activeKidId]),
  );

  // Saved ticks are for one kid on one day, so reload them when either changes.
  useEffect(() => {
    if (activeKidId == null) return;
    let cancelled = false;
    listCompletedTaskIds(db, activeKidId, day).then((taskIds) => {
      if (cancelled) return;
      doneRef.current = new Set(taskIds.map((taskId) => `${day}:${activeKidId}:${taskId}`));
      setDoneKeys(new Set(doneRef.current));
      setHydratedKey(`${day}:${activeKidId}`);
    });
    return () => {
      cancelled = true;
    };
  }, [db, activeKidId, day]);

  if (!activeKid) {
    return null;
  }

  const kidId = activeKid.id;
  const currentTasks = tasksForPeriod(tasks, period);

  async function toggleDone(task: Task) {
    if (hydratedKey !== `${day}:${kidId}`) return;
    const key = `${day}:${kidId}:${task.id}`;
    const completed = !doneRef.current.has(key);
    if (completed) {
      doneRef.current.add(key);
    } else {
      doneRef.current.delete(key);
    }
    setDoneKeys(new Set(doneRef.current));
    if (completed && currentTasks.every((t) => doneRef.current.has(`${day}:${kidId}:${t.id}`))) {
      setBurst((count) => count + 1);
    }
    const change = await setTaskCompletion(db, {
      kidId,
      taskId: task.id,
      dayKey: day,
      coinAmount: task.coinAmount,
      completed,
    });
    if (!change.changed) return;
    recordTaskCompletion(kidId, change.coins, completed);
    if (completed) {
      await showUnlockedWishes(change.savings - change.coins, change.savings);
    } else {
      dropRelockedWishes(change.savings);
    }
  }

  function dropRelockedWishes(savings: number) {
    for (const [wishId, coinAmount] of pendingUnlocks.current) {
      if (coinAmount > savings) pendingUnlocks.current.delete(wishId);
    }
    if (pendingUnlocks.current.size === 0 && unlockTimer.current) {
      clearTimeout(unlockTimer.current);
      unlockTimer.current = null;
    }
  }

  async function showUnlockedWishes(before: number, after: number) {
    const kidWishes = (await listWishes(db)).filter((wish) => wish.kidId === kidId);
    const unlocked = wishesUnlockedBy(kidWishes, before, after);
    if (unlocked.length === 0) return;
    for (const wish of unlocked) pendingUnlocks.current.set(wish.id, wish.coinAmount);
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    unlockTimer.current = setTimeout(() => {
      const ids = [...pendingUnlocks.current.keys()].join(',');
      pendingUnlocks.current.clear();
      unlockTimer.current = null;
      router.push({ pathname: '/wish-unlocked', params: { ids } });
    }, UNLOCK_DELAY_MS);
  }

  const doneCount = currentTasks.filter((task) => doneKeys.has(`${day}:${kidId}:${task.id}`)).length;
  const allDone = currentTasks.length > 0 && doneCount === currentTasks.length;

  const metrics = gridMetrics(
    currentTasks.length,
    large,
    listSize.width - GRID_PAD * 2,
    listSize.height - bannerHeight - GRID_GAP - GRID_PAD,
  );
  const tileBox = { width: metrics.tileWidth, height: metrics.tileHeight };

  function onListLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setListSize((size) => (size.width === width && size.height === height ? size : { width, height }));
  }

  function onBannerLayout(event: LayoutChangeEvent) {
    setBannerHeight(Math.ceil(event.nativeEvent.layout.height));
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list} onLayout={onListLayout}>
        <View style={styles.banner} onLayout={onBannerLayout}>
          <Text style={styles.bannerEmoji}>{PERIOD_EMOJIS[period]}</Text>
          <View style={styles.bannerText}>
            <Text style={styles.heading}>{PERIOD_LABELS[period]} tasks</Text>
            {currentTasks.length > 0 ? (
              <Text
                style={[styles.stars, allDone && styles.allDone]}
                accessibilityLabel={`${doneCount} of ${currentTasks.length} done`}
              >
                {allDone
                  ? 'All done! 🎉'
                  : '⭐'.repeat(doneCount) + '☆'.repeat(currentTasks.length - doneCount)}
              </Text>
            ) : null}
          </View>
        </View>
        {currentTasks.length === 0 ? (
          loading ? (
            <Text style={styles.loading}>Loading tasks…</Text>
          ) : (
            <EmptyState emoji="😴" text="No tasks right now. Time to play!" />
          )
        ) : listSize.width > 0 ? (
          // A wrapping row rather than a FlatList: changing a FlatList's column
          // count remounts it, which replays every tile's fade-in mid-tick.
          <View style={styles.grid}>
            {currentTasks.map((task, index) => (
              <FadeInUp key={task.id} index={index} style={tileBox}>
                <TaskCard
                  task={task}
                  done={doneKeys.has(`${day}:${kidId}:${task.id}`)}
                  onPress={() => toggleDone(task)}
                  index={index}
                  large={large}
                  style={styles.tile}
                />
              </FadeInUp>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <Celebration burst={burst} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  list: { gap: GRID_GAP, flexGrow: 1, paddingHorizontal: GRID_PAD, paddingBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: GRID_GAP },
  tile: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.sky,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  bannerEmoji: { fontSize: 44 },
  bannerText: { flex: 1, gap: 2 },
  heading: { ...typography.heading, color: colors.text },
  stars: { fontSize: 22, color: colors.sunshine, fontFamily: fonts.display, letterSpacing: 2 },
  allDone: { color: colors.successDark, letterSpacing: 0 },
  loading: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
