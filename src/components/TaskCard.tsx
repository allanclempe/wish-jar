import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Task } from '../db';
import { colors, fonts, radius, shadow, spacing, typography } from '../theme';
import { useNativeDriver } from './Animations';
import { IconBadge } from './Icons';

type TaskCardProps = {
  task: Task;
  done: boolean;
  onPress: () => void;
};

// Ticking a task squishes the card, pops a big check in and floats the coins
// up toward the counter in the header.
export function TaskCard({ task, done, onPress }: TaskCardProps) {
  const [squish] = useState(() => new Animated.Value(1));
  const [check] = useState(() => new Animated.Value(done ? 1 : 0));
  const [coinFloat] = useState(() => new Animated.Value(0));
  // Only a tap animates; ticks loaded from the database just appear.
  const tapped = useRef(false);

  useEffect(() => {
    if (!tapped.current) {
      check.setValue(done ? 1 : 0);
      return;
    }
    tapped.current = false;
    if (done) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      squish.setValue(0.9);
      check.setValue(0);
      coinFloat.setValue(0);
      Animated.parallel([
        Animated.spring(squish, { toValue: 1, friction: 3, tension: 160, useNativeDriver }),
        Animated.spring(check, { toValue: 1, friction: 4, tension: 120, useNativeDriver }),
        Animated.timing(coinFloat, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver,
        }),
      ]).start();
    } else {
      Haptics.selectionAsync().catch(() => {});
      Animated.timing(check, { toValue: 0, duration: 150, useNativeDriver }).start();
    }
  }, [done, check, squish, coinFloat]);

  function press() {
    tapped.current = true;
    onPress();
  }

  return (
    <Pressable
      onPress={press}
      accessibilityRole="checkbox"
      accessibilityLabel={task.name}
      accessibilityState={{ checked: done }}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.card,
            done && styles.cardDone,
            { transform: [{ scale: pressed ? 0.97 : 1 }, { scale: squish }] },
          ]}
        >
          <IconBadge icon={task.icon} fallbackEmoji="🧹" size={64} />
          <View style={styles.details}>
            <Text style={[styles.name, done && styles.nameDone]} numberOfLines={2}>
              {task.name}
            </Text>
            <View style={styles.coinPill}>
              <Text style={styles.coinText}>🪙 {task.coinAmount}</Text>
            </View>
          </View>
          <View style={[styles.checkCircle, done && styles.checkCircleDone]}>
            <Animated.Text
              style={[
                styles.checkMark,
                {
                  opacity: check,
                  transform: [{ scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
                },
              ]}
            >
              ✓
            </Animated.Text>
          </View>
          <Animated.Text
            pointerEvents="none"
            style={[
              styles.coinFloat,
              {
                opacity: coinFloat.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateY: coinFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -90] }) },
                  { scale: coinFloat.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1.3, 1] }) },
                ],
              },
            ]}
          >
            +{task.coinAmount} 🪙
          </Animated.Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

const CHECK_SIZE = 52;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow,
  },
  cardDone: { borderColor: colors.success },
  details: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  name: { ...typography.heading, fontSize: 20, color: colors.text },
  nameDone: { color: colors.textMuted },
  // White with a yellow rim, like the coin counter, so the gold coin stands out.
  coinPill: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.sunshine,
    borderRadius: radius.pill,
    paddingVertical: 0,
    paddingHorizontal: spacing.sm + 2,
  },
  coinText: { fontSize: 15, fontFamily: fonts.display, color: colors.text },
  checkCircle: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDone: { borderColor: colors.successDark, backgroundColor: colors.success },
  checkMark: { fontSize: 30, fontFamily: fonts.display, color: colors.surface },
  coinFloat: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    fontSize: 22,
    fontFamily: fonts.display,
    color: colors.primary,
  },
});
