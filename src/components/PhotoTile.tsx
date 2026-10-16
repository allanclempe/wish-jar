import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Icon } from '../db';
import { colors, fonts, offsetShadow } from '../theme';

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
  // Frame and tablet sizes: thicker rim, bigger emoji and name.
  large?: boolean;
  // Slots, all optional: the coin pill in the top-left corner, the check in
  // the bottom-right one, a sticker over the middle, and anything that floats
  // above the tile (like the coins flying up when a task is ticked). Only
  // `above` sits outside the clipped rim, so it can leave the tile.
  topLeft?: ReactNode;
  bottomRight?: ReactNode;
  sticker?: ReactNode;
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
  large = false,
  topLeft,
  bottomRight,
  sticker,
  above,
  style,
}: PhotoTileProps) {
  const photo = icon.photoUri != null;
  const nameSize = nameFontSize(name, large);

  return (
    <View style={[styles.outer, style, { transform: [{ rotate: `${tilt}deg` }] }]}>
      <View
        style={[
          styles.inner,
          large && styles.innerLarge,
          { backgroundColor: photo ? colors.surface : tint },
          done && styles.innerDone,
        ]}
      >
        {photo ? (
          <Image source={{ uri: icon.photoUri ?? undefined }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.emojiBox, large && styles.emojiBoxLarge]}>
            <Text style={[styles.emoji, large && styles.emojiLarge, done && styles.emojiDone]}>
              {icon.emoji ?? fallbackEmoji}
            </Text>
          </View>
        )}
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
        <Text
          style={[
            styles.name,
            large && styles.nameLarge,
            photo ? styles.namePhoto : styles.nameEmoji,
            { fontSize: nameSize, lineHeight: Math.round(nameSize * 1.05) },
            bottomRight != null && (large ? styles.nameBesideCheckLarge : styles.nameBesideCheck),
          ]}
          numberOfLines={3}
        >
          {name}
        </Text>
        {sticker != null ? (
          <View pointerEvents="none" style={styles.sticker}>
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
  photo: { ...FILL, width: undefined, height: undefined },
  // Leaves the bottom for the name.
  emojiBox: { ...FILL, bottom: 46, alignItems: 'center', justifyContent: 'center' },
  emojiBoxLarge: { bottom: 60 },
  emoji: { fontSize: 92, lineHeight: 110 },
  emojiLarge: { fontSize: 120, lineHeight: 140 },
  emojiDone: { opacity: 0.4 },
  emojiDoneWash: { backgroundColor: 'rgba(39, 174, 96, 0.12)' },
  name: {
    position: 'absolute',
    left: INSET + 2,
    right: INSET + 2,
    bottom: INSET + 2,
    fontFamily: fonts.display,
  },
  nameLarge: { left: INSET_LARGE + 2, right: INSET_LARGE + 2, bottom: INSET_LARGE + 2 },
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
  nameBesideCheck: { right: 68 },
  nameBesideCheckLarge: { right: 84 },
  sticker: { ...FILL, alignItems: 'center', justifyContent: 'center' },
  topLeft: { position: 'absolute', top: INSET, left: INSET },
  topLeftLarge: { top: INSET_LARGE, left: INSET_LARGE },
  bottomRight: { position: 'absolute', bottom: INSET, right: INSET },
  bottomRightLarge: { bottom: INSET_LARGE, right: INSET_LARGE },
});
