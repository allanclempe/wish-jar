import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Icon } from '../db';
import { colors, fonts, offsetShadow, radius, spacing, sunshineShadow } from '../theme';

// Tilting every other tile a touch makes a grid of them look laid out by hand.
export const TILE_TILT_DEG = 1.5;

export function tiltForIndex(index: number): number {
  return index % 2 === 0 ? -TILE_TILT_DEG : TILE_TILT_DEG;
}

type PhotoTileProps = {
  icon: Icon;
  fallbackEmoji: string;
  name: string;
  // The background of an emoji tile; photos cover the tile.
  tint: string;
  // Degrees, usually tiltForIndex(index).
  tilt?: number;
  // A green rim and overlay, with the emoji faded.
  done?: boolean;
  // Out of reach for now: the photo goes soft and washed out, an emoji fades.
  locked?: boolean;
  // Ready to take: a yellow rim with a sunshine halo around the tile.
  glow?: boolean;
  // Frame and tablet sizes: thicker rim, bigger emoji and name.
  large?: boolean;
  // Slots, all optional: the coin pill in the top-left corner, the check in
  // the bottom-right one, a sticker over the middle, a line above the name
  // (a wish's progress bar), and anything that floats above the tile (like
  // the coins flying up when a task is ticked). Only `above` sits outside the
  // clipped rim, so it can leave the tile.
  topLeft?: ReactNode;
  bottomRight?: ReactNode;
  sticker?: ReactNode;
  aboveName?: ReactNode;
  above?: ReactNode;
  // Sizes the tile; it fills its box.
  style?: StyleProp<ViewStyle>;
};

// A big card with a photo of the kid doing the thing, or a huge emoji on a
// pastel, with the name in a dark band along the bottom. Tasks and wishes both
// use it.
export function PhotoTile({
  icon,
  fallbackEmoji,
  name,
  tint,
  tilt = 0,
  done = false,
  locked = false,
  glow = false,
  large = false,
  topLeft,
  bottomRight,
  sticker,
  aboveName,
  above,
  style,
}: PhotoTileProps) {
  const photo = icon.photoUri != null;
  const nameSize = nameFontSize(name, large);

  return (
    <View style={[styles.outer, style, { transform: [{ rotate: `${tilt}deg` }] }]}>
      {glow ? <View pointerEvents="none" style={[styles.halo, large && styles.haloLarge]} /> : null}
      <View
        style={[
          styles.inner,
          large && styles.innerLarge,
          { backgroundColor: photo ? colors.surface : tint },
          done && styles.innerDone,
          glow && styles.innerGlow,
        ]}
      >
        {photo ? (
          <Image
            source={{ uri: icon.photoUri ?? undefined }}
            style={styles.photo}
            resizeMode="cover"
            // The one blur the frame can afford: a CSS filter on the web
            // export, a native one on a phone.
            blurRadius={locked ? LOCKED_BLUR : undefined}
          />
        ) : (
          <View style={[styles.emojiBox, large && styles.emojiBoxLarge, aboveName != null && styles.emojiBoxAbove]}>
            <Text style={[styles.emoji, large && styles.emojiLarge, (done || locked) && styles.emojiDone]}>
              {icon.emoji ?? fallbackEmoji}
            </Text>
          </View>
        )}
        {photo && locked ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.lockedWash]} />
        ) : null}
        {photo ? (
          <LinearGradient
            pointerEvents="none"
            colors={done ? DONE_SHADE : SHADE}
            locations={done ? DONE_SHADE_STOPS : SHADE_STOPS}
            style={StyleSheet.absoluteFill}
          />
        ) : done ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.emojiDoneWash]} />
        ) : null}
        <View pointerEvents="none" style={[styles.bottom, large && styles.bottomLarge]}>
          {aboveName}
          <Text
            style={[
              styles.name,
              photo ? styles.namePhoto : styles.nameEmoji,
              { fontSize: nameSize, lineHeight: Math.round(nameSize * 1.05) },
              bottomRight != null && (large ? styles.nameBesideCheckLarge : styles.nameBesideCheck),
            ]}
            numberOfLines={3}
          >
            {name}
          </Text>
        </View>
        {sticker != null ? (
          <View pointerEvents="none" style={styles.stickerSlot}>
            {sticker}
          </View>
        ) : null}
        {topLeft != null ? <View style={[styles.topLeft, large && styles.topLeftLarge]}>{topLeft}</View> : null}
        {bottomRight != null ? (
          <View style={[styles.bottomRight, large && styles.bottomRightLarge]}>{bottomRight}</View>
        ) : null}
      </View>
      {above}
    </View>
  );
}

type StickerSize = 'small' | 'regular' | 'large';

type StickerProps = {
  label: string;
  // Small fits a phone's grid of wishes, large the frame's tiles.
  size?: StickerSize;
};

// A yellow label slapped over the photo, tilted, with a dark lift under it.
// Wrap it in an Animated.View to spring it in.
export function Sticker({ label, size = 'regular' }: StickerProps) {
  return (
    <View style={[styles.sticker, size === 'small' && styles.stickerSmall, size === 'large' && styles.stickerLarge]}>
      <Text
        style={[
          styles.stickerText,
          size === 'small' && styles.stickerTextSmall,
          size === 'large' && styles.stickerTextLarge,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// White with a yellow rim, like the coin counter, so the gold coin stands out.
export function CoinPill({ coins, large = false }: { coins: number; large?: boolean }) {
  return (
    <View style={[styles.coinPill, large && styles.coinPillLarge]}>
      <Text style={[styles.coinText, large && styles.coinTextLarge]}>🪙 {coins}</Text>
    </View>
  );
}

// A long name gets smaller so it fits in three lines; most are two words.
function nameFontSize(name: string, large: boolean): number {
  const base = large ? 30 : 24;
  if (name.length > 40) return Math.round(base * 0.65);
  if (name.length > 20) return Math.round(base * 0.8);
  return base;
}

// Clear at the top, so the photo shows, darkening to a band behind the name.
const SHADE = ['rgba(0, 0, 0, 0)', 'rgba(61, 44, 46, 0.78)'] as const;
const SHADE_STOPS = [0.42, 1] as const;
// Done: a green wash over the whole photo, still dark behind the name.
const DONE_SHADE = ['rgba(39, 174, 96, 0.3)', 'rgba(39, 174, 96, 0.4)', 'rgba(61, 44, 46, 0.8)'] as const;
const DONE_SHADE_STOPS = [0, 0.4, 1] as const;

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const LOCKED_BLUR = 3;
const HALO = 7;
const RIM = 4;
const RIM_LARGE = 5;
const INSET = 12;
const INSET_LARGE = 16;

const styles = StyleSheet.create({
  outer: { minHeight: 0 },
  inner: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 26,
    borderWidth: RIM,
    borderColor: colors.surface,
    ...offsetShadow('rgba(61, 44, 46, 0.18)', 7),
  },
  innerLarge: { borderRadius: 32, borderWidth: RIM_LARGE },
  innerDone: { borderColor: colors.success },
  innerGlow: { borderColor: colors.sunshine, ...offsetShadow(colors.sunshineDark, 7) },
  // A soft sunshine ring around the rim: a translucent disc, no blur, which
  // the frame draws for free.
  halo: {
    position: 'absolute',
    top: -HALO,
    left: -HALO,
    right: -HALO,
    bottom: -HALO,
    borderRadius: 26 + HALO,
    backgroundColor: 'rgba(255, 201, 60, 0.45)',
  },
  haloLarge: { borderRadius: 32 + HALO },
  photo: { ...FILL, width: undefined, height: undefined },
  // Leaves the bottom for the name.
  emojiBox: { ...FILL, bottom: 46, alignItems: 'center', justifyContent: 'center' },
  emojiBoxLarge: { bottom: 60 },
  // And for the line above it.
  emojiBoxAbove: { bottom: 80 },
  emoji: { fontSize: 92, lineHeight: 110 },
  emojiLarge: { fontSize: 120, lineHeight: 140 },
  emojiDone: { opacity: 0.4 },
  emojiDoneWash: { backgroundColor: 'rgba(39, 174, 96, 0.12)' },
  lockedWash: { backgroundColor: 'rgba(255, 255, 255, 0.45)' },
  // The name and whatever sits above it, along the bottom of the tile.
  bottom: {
    position: 'absolute',
    left: INSET + 2,
    right: INSET + 2,
    bottom: INSET + 2,
    gap: 6,
  },
  bottomLarge: { left: INSET_LARGE + 2, right: INSET_LARGE + 2, bottom: INSET_LARGE + 2 },
  name: { fontFamily: fonts.display },
  namePhoto: {
    color: colors.surface,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  nameEmoji: {
    color: colors.text,
    textShadowColor: 'rgba(255, 255, 255, 0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  // Room for the check so the name wraps before it.
  nameBesideCheck: { marginRight: 68 - INSET - 2 },
  nameBesideCheckLarge: { marginRight: 84 - INSET_LARGE - 2 },
  stickerSlot: { ...FILL, alignItems: 'center', justifyContent: 'center' },
  sticker: {
    backgroundColor: colors.sunshine,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: colors.surface,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.xs,
    transform: [{ rotate: '-12deg' }],
    ...offsetShadow('rgba(61, 44, 46, 0.35)', 5),
  },
  stickerSmall: { paddingHorizontal: spacing.md - 2, paddingVertical: 2 },
  stickerLarge: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.lg },
  stickerText: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text, letterSpacing: 1 },
  stickerTextSmall: { fontSize: 22, lineHeight: 28 },
  stickerTextLarge: { fontSize: 40, lineHeight: 48 },
  coinPill: {
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.sunshine,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    ...sunshineShadow,
  },
  coinPillLarge: { paddingHorizontal: spacing.md - 2, paddingVertical: 1 },
  coinText: { fontSize: 16, lineHeight: 26, fontFamily: fonts.display, color: colors.text },
  coinTextLarge: { fontSize: 20, lineHeight: 30 },
  topLeft: { position: 'absolute', top: INSET, left: INSET },
  topLeftLarge: { top: INSET_LARGE, left: INSET_LARGE },
  bottomRight: { position: 'absolute', bottom: INSET, right: INSET },
  bottomRightLarge: { bottom: INSET_LARGE, right: INSET_LARGE },
});
