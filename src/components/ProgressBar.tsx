import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

const HEIGHT = 12;

type ProgressBarProps = {
  progress: number;
};

export function ProgressBar({ progress }: ProgressBarProps) {
  const percent = Math.round(progress * 100);

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={[styles.fill, { width: `${percent}%` }]} />
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
});
