import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';

import { useNativeDriver } from '../components/Animations';
import { colors, useLargeScreen } from '../theme';
import { useParentLock } from './ParentLockProvider';

const HOLD_MS = 1000;

// The way into settings. A tap only wiggles it; a grown-up holds it for a
// second, watching it grow, and then enters the PIN.
export function ParentLockButton() {
  const { openParentScreen } = useParentLock();
  const large = useLargeScreen();
  const [hold] = useState(() => new Animated.Value(0));
  const [wiggle] = useState(() => new Animated.Value(0));

  function pressIn() {
    hold.setValue(0);
    Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver }).start();
  }

  function pressOut() {
    Animated.spring(hold, { toValue: 0, friction: 5, useNativeDriver }).start();
  }

  function tap() {
    const step = (toValue: number) => Animated.timing(wiggle, { toValue, duration: 70, useNativeDriver });
    Animated.sequence([step(1), step(-1), step(1), step(0)]).start();
  }

  function longPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    openParentScreen('/settings');
  }

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={tap}
      onLongPress={longPress}
      delayLongPress={HOLD_MS}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Grown-up settings"
      accessibilityHint="Press and hold, then enter the PIN"
    >
      <Animated.View
        style={[
          styles.button,
          large && styles.buttonLarge,
          {
            transform: [
              { scale: hold.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
              { rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-15deg', '15deg'] }) },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.fill,
            large && styles.fillLarge,
            { opacity: hold, transform: [{ scale: hold }] },
          ]}
        />
        <Text style={[styles.icon, large && styles.iconLarge]}>🔒</Text>
      </Animated.View>
    </Pressable>
  );
}

const SIZE = 36;
const SIZE_LARGE = 60;

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonLarge: { width: SIZE_LARGE, height: SIZE_LARGE, borderRadius: SIZE_LARGE / 2 },
  fill: { ...StyleSheet.absoluteFill, borderRadius: SIZE / 2, backgroundColor: colors.border },
  fillLarge: { borderRadius: SIZE_LARGE / 2 },
  icon: { fontSize: 16, opacity: 0.6 },
  iconLarge: { fontSize: 30 },
});
