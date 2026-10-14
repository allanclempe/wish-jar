import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScrollScreen } from '../src/components/ScrollScreen';
import { listPunishmentTypes, listTasks, listWishes, useDatabase } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { colors, radius, spacing, typography } from '../src/theme';

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
  const [wishCount, setWishCount] = useState(0);
  const [punishmentCount, setPunishmentCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([listTasks(db), listWishes(db), listPunishmentTypes(db)]).then(
        ([tasks, wishes, punishmentTypes]) => {
          if (cancelled) return;
          setTaskCount(tasks.length);
          setWishCount(wishes.length);
          setPunishmentCount(punishmentTypes.length);
        },
      );
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  return (
    <ScrollScreen>
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
        <MenuItem
          emoji="🎁"
          title="Wishes"
          subtitle={plural(wishCount, 'wish', 'wishes')}
          onPress={() => router.push('/wishes')}
        />
        <MenuItem
          emoji="🚫"
          title="Punishments"
          subtitle={plural(punishmentCount, 'punishment', 'punishments')}
          onPress={() => router.push('/punishment-types')}
        />
        <MenuItem
          emoji="🔢"
          title="Change PIN"
          subtitle="The code that opens this page"
          onPress={() => router.push('/change-pin')}
        />
      </View>
    </ScrollScreen>
  );
}

const ICON_SIZE = 56;

const styles = StyleSheet.create({
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
