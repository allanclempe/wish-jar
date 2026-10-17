import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { shownPhoto } from '../photos/photos';
import { colors, fonts, offsetShadow, pastelFor } from '../theme';
import type { WishProgress } from '../wishes/order';
import { Wiggle } from './Animations';
import { CoinPill, PhotoTile, Sticker, tiltForIndex } from './PhotoTile';
import { ProgressBar } from './ProgressBar';

type WishCardProps = WishProgress & {
  // Tapping a locked wish nudges, an unlocked one claims; a claimed one does
  // nothing. Leave it out for a card that is only looked at.
  onPress?: () => void;
  // Its place in the grid, for the alternating tilt; the hero card has none.
  index?: number;
  hero?: boolean;
  large?: boolean;
  // Sizes the card; it fills its box.
  style?: StyleProp<ViewStyle>;
};

// A big photo tile for one wish: the coins it costs in the corner, a bar
// filling up over the photo with how many coins are still to go. Locked, a
// small padlock sits in the corner and the wish stays in full view, so a kid
// can see what they're saving for; unlocked, it glows, rocks gently and wears
// a GET IT! sticker; claimed, a GOT IT! one.
export function WishCard({
  wish,
  state,
  coinsStillNeeded,
  progress,
  onPress,
  index = 0,
  hero = false,
  large = false,
  style,
}: WishCardProps) {
  const unlocked = state === 'unlocked';
  const locked = state === 'locked';
  // As PhotoTile shows it: a phone's own file shows the emoji elsewhere.
  const photo = shownPhoto(wish.icon.photoUri) != null;
  const claimed = state === 'claimed';
  const stickerSize = hero ? (large ? 'large' : 'regular') : large ? 'regular' : 'small';
  const label = unlocked
    ? `${wish.name}, unlocked. Tap to get it.`
    : claimed
      ? `${wish.name}, you got it`
      : `${wish.name}, locked. ${coinsStillNeeded} coins to go.`;

  return (
    <Pressable
      onPress={onPress}
      disabled={claimed || onPress == null}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}
    >
      {({ pressed }) => (
        // Only unlocked cards move, to stand out from the rest.
        <Wiggle active={unlocked} angle={2.5} style={[styles.fill, pressed && !claimed && styles.pressed]}>
          <PhotoTile
            icon={wish.icon}
            fallbackEmoji="🎁"
            name={wish.name}
            tint={pastelFor(wish.id)}
            tilt={hero ? 0 : tiltForIndex(index)}
            glow={unlocked}
            done={claimed}
            large={large}
            style={styles.fill}
            topLeft={<CoinPill coins={wish.coinAmount} large={large} />}
            topRight={
              locked ? (
                <View style={[styles.padlock, large && styles.padlockLarge]}>
                  <Text style={[styles.padlockText, large && styles.padlockTextLarge]}>🔒</Text>
                </View>
              ) : null
            }
            aboveName={
              claimed ? null : (
                <View style={styles.progress}>
                  {locked ? (
                    <Text style={[styles.toGo, large && styles.toGoLarge, !photo && styles.toGoEmoji]}>
                      🪙 {coinsStillNeeded} to go
                    </Text>
                  ) : null}
                  <ProgressBar
                    progress={progress}
                    height={large ? 14 : 10}
                    color={colors.sunshine}
                    trackColor={photo ? 'rgba(255, 255, 255, 0.5)' : 'rgba(61, 44, 46, 0.15)'}
                  />
                </View>
              )
            }
            sticker={
              unlocked ? (
                <Sticker label="GET IT!" size={stickerSize} />
              ) : claimed ? (
                <Sticker label="GOT IT!" size={stickerSize} />
              ) : null
            }
          />
        </Wiggle>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pressed: { transform: [{ scale: 0.97 }] },
  progress: { gap: 4 },
  toGo: {
    fontFamily: fonts.display,
    fontSize: 15,
    lineHeight: 20,
    color: colors.surface,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  toGoLarge: { fontSize: 19, lineHeight: 24 },
  toGoEmoji: { color: colors.text, textShadowColor: 'rgba(255, 255, 255, 0.6)' },
  // A white round badge with the padlock on it, small enough to leave the
  // wish in view.
  padlock: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...offsetShadow('rgba(61, 44, 46, 0.25)'),
  },
  padlockLarge: { width: 50, height: 50, borderRadius: 25 },
  padlockText: { fontSize: 18, lineHeight: 24 },
  padlockTextLarge: { fontSize: 24, lineHeight: 30 },
});
