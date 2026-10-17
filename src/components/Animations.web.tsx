import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

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
  type SpringToProps,
  type SquishProps,
  type WiggleProps,
} from './motion';

// The browser and the frame: CSS animations, the same moves as Animated
// makes on phones (Animations.tsx). react-native-web's Animated re-renders
// every animated view through React on each frame; on the frame's slow
// Android 6 that showed 5 or 6 frames a second while a tick played. CSS
// animations of transform and opacity run on the compositor, with no
// JavaScript per frame, even while the tick is being saved.

export const useNativeDriver = false;

type Keyframes = Record<string, Record<string, string | number>>;

// react-native-web only takes `animationKeyframes` in StyleSheet.create, and
// React Native's style types don't know it.
function animation(keyframes: Keyframes, durationMs: number, extra: Record<string, string | number> = {}): ViewStyle {
  return {
    animationKeyframes: [keyframes],
    animationDuration: `${durationMs}ms`,
    animationTimingFunction: 'linear',
    animationFillMode: 'both',
    ...extra,
  } as ViewStyle;
}

// The same keyframes under another name: switching between the two restarts
// the animation without remounting what it moves.
function renamed(keyframes: Keyframes): Keyframes {
  const { '0%': from, '100%': to, ...rest } = keyframes;
  return { from, ...rest, to };
}

// Keyframes that vary with a prop (an angle, a size) are compiled once each.
const compiled = new Map<string, ReturnType<typeof StyleSheet.create>>();
function once<T extends ReturnType<typeof StyleSheet.create>>(key: string, make: () => T): T {
  let styles = compiled.get(key);
  if (!styles) {
    styles = make();
    compiled.set(key, styles);
  }
  return styles as T;
}

function lerp(value: number, input: number[], output: number[]): number {
  for (let i = 1; i < input.length; i++) {
    if (value <= input[i]) {
      const t = (value - input[i - 1]) / (input[i] - input[i - 1]);
      return output[i - 1] + (output[i] - output[i - 1]) * t;
    }
  }
  return output[output.length - 1];
}

// Keyframes at the given moments (0 to 1) of an animation, from a function of
// that moment: how an eased Animated timing is turned into linear CSS steps.
function sampled(moments: number[], at: (t: number) => Record<string, string | number>): Keyframes {
  return Object.fromEntries(moments.map((t) => [`${Math.round(t * 1000) / 10}%`, at(t)]));
}

// Overshooting and gentle stand-ins for Animated's springs, as CSS timings.
const BOUNCY = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const GENTLE = 'cubic-bezier(0.25, 1.15, 0.5, 1)';
const GROW_TIMING = 'cubic-bezier(0.34, 1.3, 0.64, 1)';

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutQuad = (t: number) => 1 - (1 - t) ** 2;

const MOMENTS = [0, 0.04, 0.08, 0.14, 0.22, 0.32, 0.45, 0.6, 0.8, 1];

const FADE_IN_UP_MS = 600;

// True once an entrance animation of `ms` has played. Showing a hidden tab
// again restarts its CSS animations, and on the frame replaying every card's
// entrance held the switch up by a third of a second, so entrances drop their
// animation once played.
function usePlayed(ms: number): boolean {
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPlayed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return played;
}

const fadeInUpFrames: Keyframes = {
  '0%': { opacity: 0, transform: 'translateY(24px)' },
  '55%': { opacity: 1, transform: 'translateY(-3px)' },
  '80%': { transform: 'translateY(1px)' },
  '100%': { opacity: 1, transform: 'translateY(0px)' },
};

const coinFloatFrames = sampled(MOMENTS, (t) => {
  const p = easeOutQuad(t);
  return {
    opacity: lerp(p, [0, 0.15, 0.7, 1], [0, 1, 1, 0]),
    transform: `translateY(${-COIN_FLOAT_RISE * p}px) scale(${lerp(p, [0, 0.3, 1], [0.6, 1.3, 1])})`,
  };
});

const styles = StyleSheet.create({
  fadeInUp: animation(fadeInUpFrames, FADE_IN_UP_MS, { animationTimingFunction: 'ease-out' }),
  fadeOut: animation({ '0%': { opacity: 1 }, '100%': { opacity: 0 } }, FADE_OUT_MS),
  hidden: { opacity: 0 },
  floatUpA: animation(coinFloatFrames, COIN_FLOAT_MS),
  floatUpB: animation(renamed(coinFloatFrames), COIN_FLOAT_MS),
  celebration: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // Invisible once its animation ends, so nothing has to unmount it.
  piece: { position: 'absolute', opacity: 0 },
  springScale: { transitionProperty: 'transform' } as ViewStyle,
  // Grows from empty when it mounts; later changes are a transition.
  grow: animation({ '0%': { width: '0%' } }, GROW_MS, {
    animationTimingFunction: GROW_TIMING,
    animationFillMode: 'backwards',
  }),
  slide: {
    transitionProperty: 'width',
    transitionDuration: `${GROW_MS}ms`,
    transitionTimingFunction: GROW_TIMING,
  } as ViewStyle,
});

// Slides a list item up into place as it first appears, each one a beat after
// the one above it.
export function FadeInUp({ index = 0, style, children }: FadeInUpProps) {
  const delay = staggerDelay(index);
  const played = usePlayed(delay + FADE_IN_UP_MS);
  return (
    <View style={[style, !played && [styles.fadeInUp, { animationDelay: `${delay}ms` } as ViewStyle]]}>
      {children}
    </View>
  );
}

function wiggleStyles(angle: number) {
  return once(`wiggle:${angle}`, () => {
    const total = WIGGLE_STEP_MS * 5 + WIGGLE_REST_MS;
    const at = (step: number) => `${Math.round(((step * WIGGLE_STEP_MS) / total) * 1000) / 10}%`;
    const frames: Keyframes = {
      '0%': { transform: 'rotate(0deg)' },
      [at(1)]: { transform: `rotate(${angle}deg)` },
      [at(2)]: { transform: `rotate(${-angle}deg)` },
      [at(3)]: { transform: `rotate(${angle}deg)` },
      [at(4)]: { transform: `rotate(${-angle}deg)` },
      [at(5)]: { transform: 'rotate(0deg)' },
      '100%': { transform: 'rotate(0deg)' },
    };
    return StyleSheet.create({ wiggle: animation(frames, total, { animationIterationCount: 'infinite' }) });
  });
}

// Rocks its child side to side every couple of seconds while active, to draw
// a small kid's eye to it.
export function Wiggle({ active, angle = 10, style, children }: WiggleProps) {
  return <View style={[style, active && wiggleStyles(angle).wiggle]}>{children}</View>;
}

function celebrationStyles(size: number, count: number) {
  return once(`confetti:${size}:${count}`, () =>
    StyleSheet.create(
      Object.fromEntries(
        confettiPieces(size, count).map((piece, i) => [
          `piece${i}`,
          animation(
            sampled(MOMENTS, (t) => {
              const p = easeOutCubic(t);
              const y = lerp(p, [0, 0.6, 1], [0, piece.y, piece.y + piece.fall]);
              const scale = lerp(p, [0, 0.2, 1], [0.3, 1.3, 1]);
              return {
                opacity: lerp(p, [0, 0.1, 0.75, 1], [0, 1, 1, 0]),
                transform: `translateX(${piece.x * p}px) translateY(${y}px) rotate(${piece.spin * p}deg) scale(${scale})`,
              };
            }),
            CONFETTI_MS,
            { animationFillMode: 'none' },
          ),
        ]),
      ),
    ),
  );
}

// A burst of emoji confetti from the middle of its parent, which must be
// positioned. It never takes touches.
export function Celebration({ burst, size = PIECE_SIZE, count = PIECES }: CelebrationProps) {
  // Compiling a burst's keyframes took the frame 70 ms, so it happens soon
  // after mounting rather than in the tap that fires the first burst.
  useEffect(() => {
    const timer = setTimeout(() => celebrationStyles(size, count), 1000);
    return () => clearTimeout(timer);
  }, [size, count]);

  if (burst === 0) return null;
  const pieceStyles = celebrationStyles(size, count);
  // A new key per burst mounts the pieces again, which plays them again.
  return (
    <View key={burst} pointerEvents="none" style={styles.celebration}>
      {confettiPieces(size, count).map((piece, i) => (
        <Text key={i} style={[styles.piece, { fontSize: size }, pieceStyles[`piece${i}`]]}>
          {piece.emoji}
        </Text>
      ))}
    </View>
  );
}

// A spring from `from` to 1: past 1 and back, then settling, as Animated's
// spring with friction 3 to 4 does.
function springFrames(from: number): Keyframes {
  const over = 1 - from;
  return {
    '0%': { transform: `scale(${from})` },
    '35%': { transform: `scale(${1 + over * 0.18})` },
    '65%': { transform: `scale(${1 - over * 0.06})` },
    '85%': { transform: `scale(${1 + over * 0.02})` },
    '100%': { transform: 'scale(1)' },
  };
}

function squishStyles(from: number) {
  return once(`squish:${from}`, () =>
    StyleSheet.create({
      a: animation(springFrames(from), 500, { animationTimingFunction: 'ease-out' }),
      b: animation(renamed(springFrames(from)), 500, { animationTimingFunction: 'ease-out' }),
    }),
  );
}

// Squashes its child and springs it back, like a press, each time `play`
// changes after it mounts. The value it mounts with shows no animation.
export function Squish({ play, from, style, children, ...rest }: SquishProps) {
  const squish = squishStyles(from);
  // Changes of `play` since it mounted, noted while rendering.
  const [last, setLast] = useState(play);
  const [changes, setChanges] = useState(0);
  if (play !== last) {
    setLast(play);
    setChanges(changes + 1);
  }
  // Each change alternates between two copies of the keyframes, which
  // restarts them.
  const playing = changes === 0 ? null : changes % 2 ? squish.a : squish.b;
  return (
    <View {...rest} style={[style, playing]}>
      {children}
    </View>
  );
}

function springInStyles(from: number) {
  return once(`springIn:${from}`, () => {
    const frames: Keyframes = { ...springFrames(from) };
    frames['0%'] = { ...frames['0%'], opacity: 0 };
    frames['15%'] = { opacity: 1 };
    frames['100%'] = { ...frames['100%'], opacity: 1 };
    return StyleSheet.create({
      a: animation(frames, 550, { animationTimingFunction: 'ease-out' }),
      b: animation(renamed(frames), 550, { animationTimingFunction: 'ease-out' }),
    });
  });
}

// Springs its child in from small (or big, for a sticker slapped on) when
// shown by a tap, and fades it out when hidden by one.
export function SpringIn({ shown, animate, play = 0, from = 0, style, children, ...rest }: SpringInProps) {
  const springIn = springInStyles(from);
  let motion: ViewStyle | null = null;
  if (!shown) motion = animate ? styles.fadeOut : styles.hidden;
  else if (animate) motion = play % 2 ? springIn.a : springIn.b;
  return (
    <View {...rest} style={[style, motion]}>
      {children}
    </View>
  );
}

// Floats its child up and fades it away, like coins flying off a ticked
// card. It never takes touches.
export function FloatUp({ play, style, children }: FloatUpProps) {
  const motion = play === 0 ? styles.hidden : play % 2 ? styles.floatUpA : styles.floatUpB;
  return (
    <View pointerEvents="none" style={[style, motion]}>
      {children}
    </View>
  );
}

// Scales its child to `value`, springing up and dropping quickly to nothing.
// A CSS transition, so it plays only on a change, not when it mounts.
export function SpringScale({ value, style, children }: SpringScaleProps) {
  return (
    <View
      style={[
        style,
        styles.springScale,
        {
          transform: [{ scale: value }],
          transitionDuration: value > 0 ? '500ms' : `${FADE_OUT_MS}ms`,
          transitionTimingFunction: value > 0 ? BOUNCY : 'ease-out',
        } as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

// Springs its child's opacity, scale, left edge or width to new values, as a
// CSS transition, so the values it mounts with just apply.
export function SpringTo({ to, bouncy = false, style, children, ...rest }: SpringToProps) {
  const { opacity, scale, left, width } = to;
  const properties = [
    opacity !== undefined && 'opacity',
    scale !== undefined && 'transform',
    left !== undefined && 'left',
    width !== undefined && 'width',
  ].filter(Boolean);
  return (
    <View
      {...rest}
      style={[
        style,
        {
          opacity,
          left,
          width,
          transform: scale !== undefined ? [{ scale }] : undefined,
          transitionProperty: properties.join(', '),
          transitionDuration: bouncy ? '500ms' : '450ms',
          transitionTimingFunction: bouncy ? BOUNCY : GENTLE,
        } as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

// A bar's fill: grows from empty when it first appears, then slides to each
// new fraction.
export function GrowWidth({ fraction, style, children }: GrowWidthProps) {
  const width = `${Math.min(Math.max(fraction, 0), 1) * 100}%` as const;
  const grown = usePlayed(GROW_MS);
  return <View style={[style, styles.slide, !grown && styles.grow, { width }]}>{children}</View>;
}
