import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

// What Animations.tsx (phones, with Animated and the native driver) and
// Animations.web.tsx (the browser and the frame, with CSS animations) share:
// the components' props, timings and the confetti's flight paths, so the two
// look the same.

export const STAGGER_MS = 60;
export const MAX_STAGGER_MS = 480;

export function staggerDelay(index: number): number {
  return Math.min(index * STAGGER_MS, MAX_STAGGER_MS);
}

export const FADE_OUT_MS = 150;
export const COIN_FLOAT_MS = 900;
export const COIN_FLOAT_RISE = 90;
export const CONFETTI_MS = 1400;
export const WIGGLE_STEP_MS = 90;
export const WIGGLE_REST_MS = 1600;

export const CONFETTI = ['🎉', '⭐', '🪙', '✨', '🌟', '🎈'];
export const PIECE_SIZE = 34;
export const PIECES = 18;

export type ConfettiPiece = { emoji: string; x: number; y: number; fall: number; spin: number };

// Pieces fly out evenly around the middle, at three distances, and fall a
// little as they fade; `size` scales how far.
export function confettiPieces(size: number, count: number): ConfettiPiece[] {
  const reach = size / PIECE_SIZE;
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const distance = (110 + (i % 3) * 45) * reach;
    return {
      emoji: CONFETTI[i % CONFETTI.length],
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 40 * reach,
      fall: 80 * reach,
      spin: (i % 2 ? 1 : -1) * (180 + i * 20),
    };
  });
}

export type FadeInUpProps = PropsWithChildren<{
  index?: number;
  style?: StyleProp<ViewStyle>;
}>;

export type WiggleProps = PropsWithChildren<{
  active: boolean;
  // How far it rocks each way, in degrees. A big photo tile wants a few.
  angle?: number;
  style?: StyleProp<ViewStyle>;
}>;

export type CelebrationProps = {
  // Each new value fires one burst; 0 shows nothing.
  burst: number;
  // How big each piece is; the burst flies as far in proportion. The default
  // fills a screen; 20 or so suits a card.
  size?: number;
  count?: number;
};

export type SquishProps = ViewProps & {
  // Each new value squashes the child to `from` and springs it back; the
  // value it mounts with does nothing.
  play: number;
  from: number;
};

export type SpringInProps = ViewProps & {
  shown: boolean;
  // Off, the child just appears or goes, as when ticks load from the
  // database. On, it springs in from `from` times its size, or fades out.
  animate: boolean;
  // A new value springs it in again.
  play?: number;
  from?: number;
};

export type FloatUpProps = PropsWithChildren<{
  // Each new value floats the child up and away; 0 shows nothing.
  play: number;
  style?: StyleProp<ViewStyle>;
}>;

export type SpringScaleProps = PropsWithChildren<{
  // The scale to spring to, from 0; it snaps back quickly to 0.
  value: number;
  style?: StyleProp<ViewStyle>;
}>;

export type SpringTargets = { opacity?: number; scale?: number; left?: number; width?: number };

export type SpringToProps = ViewProps & {
  // Where the child goes; a change springs there, the first values just apply.
  to: SpringTargets;
  // A livelier spring that overshoots, for a pop; otherwise a gentle glide.
  bouncy?: boolean;
};

export const GROW_MS = 800;

export type GrowWidthProps = PropsWithChildren<{
  // How much of its parent's width it fills, 0 to 1. It grows from empty when
  // it first appears, then slides to each new value.
  fraction: number;
  style?: StyleProp<ViewStyle>;
}>;
