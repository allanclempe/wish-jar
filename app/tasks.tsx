import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconBadge } from '../src/components/Icons';
import { listTasks, useFamilyJar, type Task } from '../src/db';
import { EmptyState } from '../src/components/EmptyState';
import { colors, contentMaxWidth, fonts, primaryShadow, radius, spacing, typography } from '../src/theme';

export default function TasksScreen() {
  const jar = useFamilyJar();
  const [tasks, setTasks] = useState<Task[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listTasks(jar).then((loaded) => {
        if (!cancelled) setTasks(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [jar]),
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <FlatList
          data={tasks}
          keyExtractor={(task) => String(task.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              emoji="🪙"
              text="No tasks yet. Add one below and start earning coins!"
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/edit-task', params: { id: String(item.id) } })}
              accessibilityRole="button"
            >
              <IconBadge icon={item.icon} fallbackEmoji="🧹" />
              <Text style={styles.name}>{item.name}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  🪙 {item.coinAmount} {item.coinAmount === 1 ? 'coin' : 'coins'}
                </Text>
              </View>
            </Pressable>
          )}
        />

        <Pressable
          style={styles.button}
          onPress={() => router.push('/add-task')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>＋ Add a task</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md, width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' },
  list: { gap: spacing.sm, flexGrow: 1 },
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
  name: { ...typography.body, color: colors.text, fontFamily: fonts.semibold, flex: 1 },
  pill: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  pillText: { fontSize: 13, fontFamily: fonts.bold, color: colors.primary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...primaryShadow,
  },
  buttonText: { ...typography.heading, color: colors.surface },
});
