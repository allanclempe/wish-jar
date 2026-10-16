import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Task } from '../db';
import { colors, fonts, offsetShadow, pastelFor, radius, spacing, sunshineShadow } from '../theme';
import { useNativeDriver } from './Animations';
import { PhotoTile, tiltForIndex } from './PhotoTile';

type TaskCardProps = {
  task: Task;
  done: boolean;
  onPress: () => void;
  // Its place in the grid, for the alternating tilt.
  index?: number;
  large?: boolean;
  // Sizes the card; it fills its box.
  style?: StyleProp<ViewStyle>;
};

// A big photo tile for one task. Ticking it squishes the card, pops a check in
// and floats the coins up toward the counter in the header.
export function TaskCard({ task, done, onPress, index = 0, large = false, style }: TaskCardProps) {
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

  const checkSize = large ? CHECK_SIZE_LARGE : CHECK_SIZE;

  return (
    <Pressable
      onPress={press}
      accessibilityRole="checkbox"
      accessibilityLabel={task.name}
      accessibilityState={{ checked: done }}
      style={style}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.fill, { transform: [{ scale: pressed ? 0.97 : 1 }, { scale: squish }] }]}>
          <PhotoTile
            icon={task.icon}
            fallbackEmoji="🧹"
            name={task.name}
            tint={pastelFor(task.id)}
            tilt={tiltForIndex(index)}
            done={done}
            large={large}
            style={styles.fill}
            topLeft={
              <View style={[styles.coinPill, large && styles.coinPillLarge]}>
                <Text style={[styles.coinText, large && styles.coinTextLarge]}>🪙 {task.coinAmount}</Text>
              </View>
            }
            bottomRight={
              <View
                style={[
                  styles.checkCircle,
                  { width: checkSize, height: checkSize, borderRadius: checkSize / 2 },
                  done && styles.checkCircleDone,
                ]}
              >
                <Animated.Text
                  style={[
                    styles.checkMark,
                    large && styles.checkMarkLarge,
                    {
                      opacity: check,
                      transform: [{ scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
                    },
                  ]}
                >
                  ✓
                </Animated.Text>
              </View>
            }
            above={
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
            }
          />
        </Animated.View>
      )}
    </Pressable>
  );
}

const CHECK_SIZE = 50;
const CHECK_SIZE_LARGE = 62;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // White with a yellow rim, like the coin counter, so the gold coin stands out.
  coinPill: {
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.sunshine,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    ...sunshineShadow,
  },
  coinPillLarge: { paddingHorizontal: spacing.md - 2, paddingVertical: 1 },
  coinText: { fontSize: 16, lineHeight: 26, fontFamily: fonts.display, color: colors.text },
  coinTextLarge: { fontSize: 20, lineHeight: 30 },
  checkCircle: {
    borderWidth: 4,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...offsetShadow('rgba(0, 0, 0, 0.15)', 3),
  },
  checkCircleDone: { borderColor: colors.successDark, backgroundColor: colors.success },
  checkMark: { fontSize: 28, fontFamily: fonts.display, color: colors.surface },
  checkMarkLarge: { fontSize: 34 },
  coinFloat: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    fontSize: 26,
    fontFamily: fonts.display,
    color: colors.primaryDark,
    textShadowColor: colors.surface,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
});
