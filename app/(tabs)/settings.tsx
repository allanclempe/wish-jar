import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listTasks, useDatabase } from '../../src/db';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { colors, radius, spacing, typography } from '../../src/theme';

type MenuItemProps = {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

function MenuItem({ emoji, title, subtitle, onPress }: MenuItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.menuIcon}>
        <Text style={styles.menuEmoji}>{emoji}</Text>
      </View>
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export default function SettingsScreen() {
  const db = useDatabase();
  const { kids } = useActiveKid();
  const [taskCount, setTaskCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listTasks(db).then((tasks) => {
        if (!cancelled) setTaskCount(tasks.length);
      });
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Settings ⚙️</Text>

        <View style={styles.menu}>
          <MenuItem
            emoji="🧒"
            title="Kids"
            subtitle={plural(kids.length, 'kid', 'kids')}
            onPress={() => router.push('/kids')}
          />
          <MenuItem
            emoji="🧹"
            title="Tasks"
            subtitle={plural(taskCount, 'task', 'tasks')}
            onPress={() => router.push('/tasks')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const ICON_SIZE = 56;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  title: { ...typography.title, color: colors.text },
  menu: { gap: spacing.md },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  menuItemPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  menuIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuEmoji: { fontSize: 28 },
  menuText: { flex: 1, gap: 2 },
  menuTitle: { ...typography.heading, color: colors.text },
  menuSubtitle: { ...typography.caption, color: colors.textMuted },
  chevron: { fontSize: 32, color: colors.primary, fontWeight: '600' },
});
