import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ScrollScreen } from '../src/components/ScrollScreen';
import {
  listConsequenceTypes,
  listDevices,
  listTasks,
  listWishes,
  useFamilyJar,
  useJarVersion,
} from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { canOpenLinks, openLegalPage, PRIVACY_URL, TERMS_URL } from '../src/legal/LegalNote';
import { useParentLock } from '../src/parent/ParentLockProvider';
import { useSound } from '../src/sound/SoundProvider';
import { colors, fonts, radius, shadow, spacing, typography } from '../src/theme';

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

type ToggleItemProps = {
  emoji: string;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

// A menu row with a switch at the end instead of a chevron.
function ToggleItem({ emoji, title, subtitle, value, onValueChange }: ToggleItemProps) {
  return (
    <View style={styles.menuItem}>
      <View style={styles.menuIcon}>
        <Text style={styles.menuEmoji}>{emoji}</Text>
      </View>
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor={colors.surface}
        accessibilityLabel={title}
      />
    </View>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export default function SettingsScreen() {
  const jar = useFamilyJar();
  const version = useJarVersion('tasks', 'wishes', 'consequence_types', 'devices');
  const { kids } = useActiveKid();
  const { soundOn, setSoundOn } = useSound();
  const { pinSet } = useParentLock();
  const [taskCount, setTaskCount] = useState(0);
  const [wishCount, setWishCount] = useState(0);
  const [consequenceCount, setConsequenceCount] = useState(0);
  const [deviceCount, setDeviceCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([listTasks(jar), listWishes(jar), listConsequenceTypes(jar)]).then(
        ([tasks, wishes, consequenceTypes]) => {
          if (cancelled) return;
          setTaskCount(tasks.length);
          setWishCount(wishes.length);
          setConsequenceCount(consequenceTypes.length);
        },
        () => {},
      );
      listDevices(jar).then(
        (devices) => {
          if (!cancelled) setDeviceCount(devices.length);
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
          emoji="⚖️"
          title="Consequences"
          subtitle={plural(consequenceCount, 'consequence', 'consequences')}
          onPress={() => router.push('/consequence-types')}
        />
        <ToggleItem
          emoji={soundOn ? '🔊' : '🔇'}
          title="Sounds"
          subtitle={soundOn ? 'A ding for every tick, a fanfare for the last' : 'Ticks are silent'}
          value={soundOn}
          onValueChange={(on) => {
            setSoundOn(on).catch(() => {});
          }}
        />
        <MenuItem
          emoji="📱"
          title="Devices"
          subtitle={
            deviceCount == null
              ? 'Phones, frames and screens sharing this jar'
              : `${plural(deviceCount, 'device', 'devices')} sharing this jar`
          }
          onPress={() => router.push('/devices')}
        />
        <MenuItem
          emoji="🔢"
          title={pinSet ? 'Change PIN' : 'Set a PIN'}
          subtitle={pinSet ? 'The code that opens this page' : 'Anyone can open this page until you do'}
          onPress={() => router.push('/change-pin')}
        />
        <MenuItem
          emoji="🗑️"
          title="Delete family jar"
          subtitle="Everything in it, for good, on every device"
          onPress={() => router.push('/delete-family')}
        />
        {/* The Echo Show and the frame can't come back from a page (WJ-78). */}
        {canOpenLinks ? (
          <>
            <MenuItem
              emoji="🛡️"
              title="Privacy policy"
              subtitle="What Wish Jar keeps, and how to delete it"
              onPress={() => openLegalPage(PRIVACY_URL)}
            />
            <MenuItem
              emoji="📄"
              title="Terms of use"
              subtitle="The rules for using Wish Jar"
              onPress={() => openLegalPage(TERMS_URL)}
            />
          </>
        ) : null}
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
    ...shadow,
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
  chevron: { fontSize: 32, color: colors.primary, fontFamily: fonts.semibold },
});
