import { useEffect, useState, type PropsWithChildren } from 'react';
import { Animated, Easing, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

// react-native-web has no native animation module and warns when asked for it.
export const useNativeDriver = Platform.OS !== 'web';

const STAGGER_MS = 60;
const MAX_STAGGER_MS = 480;

type FadeInUpProps = PropsWithChildren<{
  index?: number;
  style?: StyleProp<ViewStyle>;
}>;

// Slides a list item up into place as it first appears, each one a beat after
// the one above it.
export function FadeInUp({ index = 0, style, children }: FadeInUpProps) {
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(appear, {
      toValue: 1,
      delay: Math.min(index * STAGGER_MS, MAX_STAGGER_MS),
      friction: 7,
      tension: 60,
      useNativeDriver,
    }).start();
  }, [appear, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: appear,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

type WiggleProps = PropsWithChildren<{
  active: boolean;
  style?: StyleProp<ViewStyle>;
}>;

// Rocks its child side to side every couple of seconds while active, to draw
// a small kid's eye to it.
export function Wiggle({ active, style, children }: WiggleProps) {
  const [rotate] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      rotate.setValue(0);
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(rotate, { toValue, duration: 90, easing: Easing.linear, useNativeDriver });
    const loop = Animated.loop(
      Animated.sequence([step(1), step(-1), step(1), step(-1), step(0), Animated.delay(1600)]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, rotate]);

  return (
    <Animated.View
      style={[
        style,
        { transform: [{ rotate: rotate.interpolate({ inputRange: [-1, 1], outputRange: ['-10deg', '10deg'] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const CONFETTI = ['🎉', '⭐', '🪙', '✨', '🌟', '🎈'];
const PIECE_SIZE = 34;
const PIECES = 18;

type CelebrationProps = {
  // Each new value fires one burst; 0 shows nothing.
  burst: number;
  // How big each piece is; the burst flies as far in proportion. The default
  // fills a screen; 20 or so suits a card.
  size?: number;
  count?: number;
};

// A burst of emoji confetti from the middle of its parent, which must be
// positioned. It never takes touches.
export function Celebration({ burst, size = PIECE_SIZE, count = PIECES }: CelebrationProps) {
  const [progress] = useState(() => new Animated.Value(0));
  const [pieces] = useState(() => {
    const reach = size / PIECE_SIZE;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const distance = (110 + (i % 3) * 45) * reach;
      return {
        emoji: CONFETTI[i % CONFETTI.length],
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance - 40 * reach,
        fall: 80 * reach,
        spin: `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
      };
    });
  });

  useEffect(() => {
    if (burst === 0) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    }).start();
  }, [burst, progress]);

  if (burst === 0) return null;

  return (
    <Animated.View pointerEvents="none" style={styles.celebration}>
      {pieces.map((piece, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.piece,
            { fontSize: size },
            {
              opacity: progress.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, piece.x] }) },
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 0.6, 1],
                    outputRange: [0, piece.y, piece.y + piece.fall],
                  }),
                },
                { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', piece.spin] }) },
                { scale: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.3, 1.3, 1] }) },
              ],
            },
          ]}
        >
          {piece.emoji}
        </Animated.Text>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  celebration: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },
});
