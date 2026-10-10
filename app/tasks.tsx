import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listTasks, useDatabase, type Task } from '../src/db';
import { colors, radius, spacing, typography } from '../src/theme';

export default function TasksScreen() {
  const db = useDatabase();
  const [tasks, setTasks] = useState<Task[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listTasks(db).then((loaded) => {
        if (!cancelled) setTasks(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <FlatList
          data={tasks}
          keyExtractor={(task) => String(task.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.card}>
              <Text style={styles.cardEmoji}>🪙</Text>
              <Text style={styles.cardText}>
                No tasks yet. Add one below and start earning coins!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.coins}>
                {item.coinAmount} {item.coinAmount === 1 ? 'coin' : 'coins'}
              </Text>
            </View>
          )}
        />

        <Pressable
          style={styles.button}
          onPress={() => router.push('/add-task')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Add a task</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.sm, flexGrow: 1 },
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
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  name: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  coins: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: { ...typography.heading, color: colors.surface },
});
