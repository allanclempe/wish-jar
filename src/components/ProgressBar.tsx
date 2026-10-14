import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

const HEIGHT = 20;

type ProgressBarProps = {
  progress: number;
};

// Fills up from empty when first shown, then slides to each new amount, so a
// kid sees the bar grow as they earn coins.
export function ProgressBar({ progress }: ProgressBarProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const percent = Math.round(clamped * 100);
  const [fill] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // Width can't use the native driver.
    Animated.timing(fill, {
      toValue: clamped,
      duration: 800,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: false,
    }).start();
  }, [clamped, fill]);

  const complete = clamped >= 1;

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <Animated.View
        style={[
          styles.fill,
          complete && styles.fillComplete,
          { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) },
        ]}
      >
        <View style={styles.shine} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    backgroundColor: colors.primary,
  },
  fillComplete: { backgroundColor: colors.successDark },
  shine: {
    position: 'absolute',
    top: 4,
    left: HEIGHT / 2,
    right: HEIGHT / 2,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
});
