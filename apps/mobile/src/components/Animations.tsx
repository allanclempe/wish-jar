import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';

import {
  COIN_FLOAT_MS,
  COIN_FLOAT_RISE,
  CONFETTI_MS,
  FADE_OUT_MS,
  GROW_MS,
  PIECE_SIZE,
  PIECES,
  WIGGLE_REST_MS,
  WIGGLE_STEP_MS,
  confettiPieces,
  staggerDelay,
  type CelebrationProps,
  type FadeInUpProps,
  type FloatUpProps,
  type GrowWidthProps,
  type SpringInProps,
  type SpringScaleProps,
  type SpringTargets,
  type SpringToProps,
  type SquishProps,
  type WiggleProps,
} from './motion';

// Phones: Animated with the native driver. The browser and the frame use
// Animations.web.tsx, with CSS animations instead; both share motion.ts.

// react-native-web has no native animation module and warns when asked for it.
export const useNativeDriver = Platform.OS !== 'web';

// Slides a list item up into place as it first appears, each one a beat after
// the one above it.
export function FadeInUp({ index = 0, style, children }: FadeInUpProps) {
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(appear, {
      toValue: 1,
      delay: staggerDelay(index),
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

// Rocks its child side to side every couple of seconds while active, to draw
// a small kid's eye to it.
export function Wiggle({ active, angle = 10, style, children }: WiggleProps) {
  const [rotate] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      rotate.setValue(0);
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(rotate, { toValue, duration: WIGGLE_STEP_MS, easing: Easing.linear, useNativeDriver });
    const loop = Animated.loop(
      Animated.sequence([step(1), step(-1), step(1), step(-1), step(0), Animated.delay(WIGGLE_REST_MS)]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, rotate]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { rotate: rotate.interpolate({ inputRange: [-1, 1], outputRange: [`-${angle}deg`, `${angle}deg`] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// A burst of emoji confetti from the middle of its parent, which must be
// positioned. It never takes touches.
export function Celebration({ burst, size = PIECE_SIZE, count = PIECES }: CelebrationProps) {
  const [progress] = useState(() => new Animated.Value(0));
  const [pieces] = useState(() => confettiPieces(size, count));

  useEffect(() => {
    if (burst === 0) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: CONFETTI_MS,
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
                { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${piece.spin}deg`] }) },
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

// Squashes its child and springs it back, like a press, each time `play`
// changes after it mounts.
export function Squish({ play, from, style, children, ...rest }: SquishProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const mountedWith = useRef(play);

  useEffect(() => {
    if (play === mountedWith.current) return;
    scale.setValue(from);
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 160, useNativeDriver }).start();
  }, [play, from, scale]);

  return (
    <Animated.View {...rest} style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

// Springs its child in from small (or big, for a sticker slapped on) when
// shown by a tap, and fades it out when hidden by one.
export function SpringIn({ shown, animate, play = 0, from = 0, style, children, ...rest }: SpringInProps) {
  const [progress] = useState(() => new Animated.Value(shown ? 1 : 0));

  useEffect(() => {
    if (!animate) {
      progress.setValue(shown ? 1 : 0);
      return;
    }
    if (shown) {
      progress.setValue(0);
      Animated.spring(progress, { toValue: 1, friction: 4, tension: 120, useNativeDriver }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver }).start();
    }
  }, [shown, animate, play, progress]);

  return (
    <Animated.View
      {...rest}
      style={[
        style,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Floats its child up and fades it away, like coins flying off a ticked
// card. It never takes touches.
export function FloatUp({ play, style, children }: FloatUpProps) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (play === 0) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: COIN_FLOAT_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver,
    }).start();
  }, [play, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -COIN_FLOAT_RISE] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1.3, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Scales its child to `value`, springing up and dropping quickly to nothing.
export function SpringScale({ value, style, children }: SpringScaleProps) {
  const [scale] = useState(() => new Animated.Value(value));

  useEffect(() => {
    const animation =
      value > 0
        ? Animated.spring(scale, { toValue: value, friction: 4, tension: 120, useNativeDriver })
        : Animated.timing(scale, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver });
    animation.start();
    return () => animation.stop();
  }, [value, scale]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

// Springs its child's opacity, scale, left edge or width to new values. Left
// and width are layout, which the native driver can't animate, so with
// either of them the whole spring runs in JavaScript.
export function SpringTo({ to, bouncy = false, style, children, ...rest }: SpringToProps) {
  const [values] = useState(() => {
    const initial: Partial<Record<keyof SpringTargets, Animated.Value>> = {};
    for (const key of Object.keys(to) as (keyof SpringTargets)[]) initial[key] = new Animated.Value(to[key] ?? 0);
    return initial;
  });
  const { opacity, scale, left, width } = to;
  const native = left === undefined && width === undefined && useNativeDriver;

  useEffect(() => {
    const targets: SpringTargets = { opacity, scale, left, width };
    const springs = (Object.keys(values) as (keyof SpringTargets)[]).flatMap((key) => {
      const value = values[key];
      const toValue = targets[key];
      if (!value || toValue === undefined) return [];
      return [
        Animated.spring(value, {
          toValue,
          friction: bouncy ? 4 : 8,
          tension: bouncy ? 120 : 90,
          useNativeDriver: native,
        }),
      ];
    });
    const animation = Animated.parallel(springs);
    animation.start();
    return () => animation.stop();
  }, [opacity, scale, left, width, bouncy, native, values]);

  return (
    <Animated.View
      {...rest}
      style={[
        style,
        {
          opacity: values.opacity,
          left: values.left,
          width: values.width,
          transform: values.scale ? [{ scale: values.scale }] : undefined,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// A bar's fill: grows from empty when it first appears, then slides to each
// new fraction. Width can't use the native driver.
export function GrowWidth({ fraction, style, children }: GrowWidthProps) {
  const [fill] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fill, {
      toValue: fraction,
      duration: GROW_MS,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: false,
    }).start();
  }, [fraction, fill]);

  return (
    <Animated.View
      style={[
        style,
        { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  celebration: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },
});
