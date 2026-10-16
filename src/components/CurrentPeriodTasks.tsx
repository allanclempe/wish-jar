import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import {
  listCompletedTaskIds,
  listTasks,
  listWishes,
  setTaskCompletion,
  useDatabase,
  type Period,
  type Task,
} from '../db';
import { useActiveKid } from '../kids/ActiveKidProvider';
import { fonts, skies, spacing, typography, useLargeScreen } from '../theme';
import { PERIOD_EMOJIS, tasksForPeriod } from '../tasks/period';
import { wishesUnlockedBy } from '../wishes/order';
import { Celebration, FadeInUp } from './Animations';
import { EmptyState } from './EmptyState';
import { TaskCard } from './TaskCard';
import { TILE_TILT_DEG } from './PhotoTile';

const GRID_GAP = spacing.md;
// Tilted tiles poke a few pixels past the grid; the ScrollView would clip them.
const LIST_PAD_TOP = spacing.md;
const LIST_PAD_BOTTOM = spacing.lg;
// Kept clear on the right of the header for the jar WJ-26 adds there.
const JAR_SPACE = 140;
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
  // On web a tilted tile's corners count towards the scrollable area, so each
  // row gives the tilt its room or the screen scrolls by a few pixels.
  const tiltRoom = Math.ceil(fullWidth * Math.sin((TILE_TILT_DEG * Math.PI) / 180));
  const fitted = fits ? (height - GRID_GAP * (rows - 1) - tiltRoom * rows) / rows : tallest;
  const tileHeight = Math.floor(Math.min(tallest, fitted));
  // A lone task on the frame would otherwise stretch across the screen and
  // grow taller than it: a fitting tile gives up width before it stops fitting,
  // and the row centres it.
  const tileWidth = fits ? Math.min(fullWidth, Math.floor(tileHeight * WIDEST_TILE)) : fullWidth;
  return { columns, tileWidth, tileHeight };
}
// Lets the tick's coin float and confetti play before the achievement opens.
const UNLOCK_DELAY_MS = 900;

type CurrentPeriodTasksProps = {
  // The period and day from the screen's clock (useClock), which also drives
  // the sky behind this list.
  period: Period;
  day: string;
};

export function CurrentPeriodTasks({ period, day }: CurrentPeriodTasksProps) {
  const db = useDatabase();
  const { activeKid, recordTaskCompletion } = useActiveKid();
  const large = useLargeScreen();
  const activeKidId = activeKid?.id ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Saved ticks are for one kid on one day, so reload them when either changes;
  // once the day key changes no task looks done.
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
  const sky = skies[period];

  // The sky reaches the edges of the screen, so the list keeps its own gutter.
  const gutter = large ? spacing.lg : spacing.md;
  const metrics = gridMetrics(
    currentTasks.length,
    large,
    listSize.width - gutter * 2,
    listSize.height - LIST_PAD_TOP - bannerHeight - GRID_GAP - LIST_PAD_BOTTOM,
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
        onLayout={onListLayout}
      >
        {/* The header sits on the sky: the period's emoji, whose morning it
            is, and how many tasks are left. */}
        <View style={styles.header} onLayout={onBannerLayout}>
          <Text style={[styles.title, large && styles.titleLarge, { color: sky.title }]}>
            {PERIOD_EMOJIS[period]} {activeKid.name}&apos;s {period}
          </Text>
          {currentTasks.length > 0 ? (
            <Text
              style={[styles.subtitle, large && styles.subtitleLarge, { color: sky.subtitle }]}
              accessibilityLabel={`${doneCount} of ${currentTasks.length} done`}
            >
              {allDone ? 'All done! 🎉' : `${currentTasks.length - doneCount} more to go!`}
            </Text>
          ) : null}
        </View>
        {currentTasks.length === 0 ? (
          loading ? (
            <Text style={[styles.loading, { color: sky.subtitle }]}>Loading tasks…</Text>
          ) : (
            <EmptyState
              emoji="😴"
              text="No tasks right now. Time to play!"
              textColor={sky.subtitle}
            />
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
  list: { gap: GRID_GAP, flexGrow: 1, paddingTop: LIST_PAD_TOP, paddingBottom: LIST_PAD_BOTTOM },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: GRID_GAP },
  tile: { flex: 1 },
  header: { gap: spacing.xs, paddingRight: JAR_SPACE, marginBottom: spacing.xs },
  title: { ...typography.hero },
  titleLarge: { fontSize: 44, lineHeight: 52 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 17 },
  subtitleLarge: { fontSize: 22 },
  loading: { ...typography.body, textAlign: 'center' },
});
