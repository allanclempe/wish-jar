import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

const HEIGHT = 20;

type ProgressBarProps = {
  progress: number;
  // The bar's height; the default suits a row of text, a wish tile wants a
  // thinner one over its photo.
  height?: number;
  // The fill while the bar is filling (it goes green once full) and the track
  // behind it.
  color?: string;
  trackColor?: string;
};

// Fills up from empty when first shown, then slides to each new amount, so a
// kid sees the bar grow as they earn coins.
export function ProgressBar({
  progress,
  height = HEIGHT,
  color = colors.primary,
  trackColor = colors.border,
}: ProgressBarProps) {
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
  const shineInset = height / 2;
  const shineHeight = Math.max(2, Math.round(height / 5));

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <Animated.View
        style={[
          styles.fill,
          { height, borderRadius: height / 2, backgroundColor: complete ? colors.successDark : color },
          { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) },
        ]}
      >
        <View
          style={[
            styles.shine,
            { top: shineInset - shineHeight - 1, left: shineInset, right: shineInset, height: shineHeight },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
  fill: {},
  shine: {
    position: 'absolute',
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
});
