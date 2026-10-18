import * as Haptics from 'expo-haptics';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Task } from '../db';
import { useSound } from '../sound/SoundProvider';
import { colors, fonts, offsetShadow, pastelFor, spacing } from '../theme';
import { Celebration, FloatUp, SpringIn, Squish } from './Animations';
import { CoinPill, PhotoTile, Sticker, tiltForIndex } from './PhotoTile';

type TaskCardProps = {
  task: Task;
  done: boolean;
  // Given the task, so the list can pass one handler that never changes and
  // a tick only re-renders the card it changed.
  onPress: (task: Task) => void;
  // Its place in the grid, for the alternating tilt.
  index?: number;
  large?: boolean;
  // Sizes the card; it fills its box.
  style?: StyleProp<ViewStyle>;
};

// A big photo tile for one task. Ticking it squishes the card, pops a check
// in, slaps a DONE sticker over the photo, bursts a little confetti and
// floats the coins up toward the counter in the header, with a ding.
export const TaskCard = memo(function TaskCard({ task, done, onPress, index = 0, large = false, style }: TaskCardProps) {
  const { playCoin } = useSound();
  // Ticks so far, each one squishing the card, floating the coins and
  // bursting the confetti.
  const [ticks, setTicks] = useState(0);
  // The last tap: what it set the card to, and how many taps so far. Only a
  // tap animates the check and the sticker; ticks loaded from the database,
  // for another kid or a new day, just appear.
  const [tap, setTap] = useState<{ done: boolean; count: number } | null>(null);
  const animate = tap != null && tap.done === done;

  function press() {
    const next = !done;
    setTap((last) => ({ done: next, count: (last?.count ?? 0) + 1 }));
    // Before anything async: browsers only start a sound from inside the tap.
    if (next) {
      playCoin();
      setTicks((count) => count + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress(task);
  }

  const checkSize = large ? CHECK_SIZE_LARGE : CHECK_SIZE;

  return (
    <Pressable
      onPress={press}
      accessibilityRole="checkbox"
      accessibilityLabel={task.name}
      accessibilityState={{ checked: done }}
      // A style function rather than a function child: pressing re-renders
      // only the Pressable, not the photo tile inside it.
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      <Squish play={ticks} from={0.9} style={styles.fill}>
        <PhotoTile
          icon={task.icon}
          fallbackEmoji="🧹"
          name={task.name}
          tint={pastelFor(task.id)}
          tilt={tiltForIndex(index)}
          done={done}
          large={large}
          style={styles.fill}
          topLeft={<CoinPill coins={task.coinAmount} large={large} />}
          sticker={
            // Lands from above the card and overshoots, like a real slap.
            <SpringIn shown={done} animate={animate} play={tap?.count} from={2.6}>
              <Sticker label="DONE!" size={large ? 'large' : 'regular'} />
            </SpringIn>
          }
          bottomRight={
            <View
              style={[
                styles.checkCircle,
                { width: checkSize, height: checkSize, borderRadius: checkSize / 2 },
                done && styles.checkCircleDone,
              ]}
            >
              <SpringIn shown={done} animate={animate} play={tap?.count} from={0.2}>
                <Text style={[styles.checkMark, large && styles.checkMarkLarge]}>✓</Text>
              </SpringIn>
            </View>
          }
          above={
            <>
              <Celebration burst={ticks} size={large ? 26 : 20} count={10} />
              <FloatUp play={ticks} style={styles.coinFloat}>
                <Text style={styles.coinFloatText}>+{task.coinAmount} 🪙</Text>
              </FloatUp>
            </>
          }
        />
      </Squish>
    </Pressable>
  );
});

const CHECK_SIZE = 50;
const CHECK_SIZE_LARGE = 62;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pressed: { transform: [{ scale: 0.97 }] },
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
  coinFloat: { position: 'absolute', right: spacing.md, top: 0 },
  coinFloatText: {
    fontSize: 26,
    fontFamily: fonts.display,
    color: colors.primaryDark,
    textShadowColor: colors.surface,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
});
