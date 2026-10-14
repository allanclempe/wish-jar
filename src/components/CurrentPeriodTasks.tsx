import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, StyleSheet, Text, View } from 'react-native';

import { listCompletedTaskIds, listTasks, setTaskCompletion, useDatabase, type Task } from '../db';
import { useActiveKid } from '../kids/ActiveKidProvider';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { currentPeriod, PERIOD_EMOJIS, PERIOD_LABELS, tasksForPeriod } from '../tasks/period';
import { dayKey } from '../tasks/day';
import { Celebration, FadeInUp } from './Animations';
import { TaskCard } from './TaskCard';

const PERIOD_CHECK_INTERVAL_MS = 60_000;

export function CurrentPeriodTasks() {
  const db = useDatabase();
  const { activeKid, recordTaskCompletion } = useActiveKid();
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
    if (change.changed) {
      recordTaskCompletion(kidId, change.coins, completed);
    }
  }

  const doneCount = currentTasks.filter((task) => doneKeys.has(`${day}:${kidId}:${task.id}`)).length;
  const allDone = currentTasks.length > 0 && doneCount === currentTasks.length;

  return (
    <View style={styles.container}>
      <FlatList
        data={currentTasks}
        keyExtractor={(task) => String(task.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.banner}>
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
        }
        ListEmptyComponent={
          loading ? (
            <Text style={styles.cardText}>Loading tasks…</Text>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardEmoji}>😴</Text>
              <Text style={styles.cardText}>No tasks right now. Time to play!</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <FadeInUp index={index}>
            <TaskCard
              task={item}
              done={doneKeys.has(`${day}:${kidId}:${item.id}`)}
              onPress={() => toggleDone(item)}
            />
          </FadeInUp>
        )}
      />
      <Celebration burst={burst} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { gap: spacing.md, flexGrow: 1, paddingBottom: spacing.lg },
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
  stars: { fontSize: 22, color: colors.sunshine, fontWeight: '800', letterSpacing: 2 },
  allDone: { color: colors.successDark, letterSpacing: 0 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    ...shadow,
  },
  cardEmoji: { fontSize: 64 },
  cardText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
