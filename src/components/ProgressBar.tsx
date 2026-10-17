import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { GrowWidth } from './Animations';

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

  const complete = clamped >= 1;
  const shineInset = height / 2;
  const shineHeight = Math.max(2, Math.round(height / 5));

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <GrowWidth
        fraction={clamped}
        style={[
          styles.fill,
          { height, borderRadius: height / 2, backgroundColor: complete ? colors.successDark : color },
        ]}
      >
        <View
          style={[
            styles.shine,
            { top: shineInset - shineHeight - 1, left: shineInset, right: shineInset, height: shineHeight },
          ]}
        />
      </GrowWidth>
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
