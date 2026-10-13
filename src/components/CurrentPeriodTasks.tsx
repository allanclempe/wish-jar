import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { listCompletedTaskIds, listTasks, setTaskCompletion, useDatabase, type Task } from '../db';
import { useActiveKid } from '../kids/ActiveKidProvider';
import { colors, radius, spacing, typography } from '../theme';
import { currentPeriod, PERIOD_LABELS, tasksForPeriod } from '../tasks/period';
import { dayKey } from '../tasks/day';
import { IconBadge } from './Icons';

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

  return (
    <FlatList
      data={currentTasks}
      keyExtractor={(task) => String(task.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<Text style={styles.heading}>{PERIOD_LABELS[period]} tasks</Text>}
      ListEmptyComponent={
        loading ? (
          <Text style={styles.cardText}>Loading tasks…</Text>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardEmoji}>🪙</Text>
            <Text style={styles.cardText}>No tasks for this part of the day.</Text>
          </View>
        )
      }
      renderItem={({ item }) => {
        const done = doneKeys.has(`${day}:${kidId}:${item.id}`);
        return (
          <Pressable
            style={styles.row}
            onPress={() => toggleDone(item)}
            accessibilityRole="checkbox"
            accessibilityLabel={item.name}
            accessibilityState={{ checked: done }}
          >
            <IconBadge icon={item.icon} fallbackEmoji="🧹" />
            <View style={styles.details}>
              <Text style={[styles.name, done && styles.nameDone]}>{item.name}</Text>
              <Text style={styles.period}>{PERIOD_LABELS[item.period]}</Text>
            </View>
            <Text style={styles.status}>{done ? '✅' : '⬜️'}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, flexGrow: 1 },
  heading: { ...typography.heading, color: colors.text, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
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
  nameDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  period: { ...typography.caption, color: colors.textMuted },
  status: { fontSize: 24 },
});
