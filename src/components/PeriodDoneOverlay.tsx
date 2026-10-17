import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { Kid, Period } from '../db';
import { useSound } from '../sound/SoundProvider';
import { PERIOD_LABELS } from '../tasks/period';
import { colors, fonts, offsetShadow, radius, spacing, typography, useLargeScreen } from '../theme';
import { Celebration, SpringIn, Wiggle } from './Animations';
import { CoinJar } from './CoinJar';

type PeriodDoneOverlayProps = {
  kid: Kid;
  period: Period;
  // How many tasks the period had, so the jar shows full.
  total: number;
  // The coins earned today across every period.
  coinsToday: number;
  onSeeWishes: () => void;
  onKeepGoing: () => void;
};

// Covers the tasks tab once the last task of the period is ticked: the kid
// with a crown, the jar full, the day's coins and the way to their wishes.
// An overlay rather than a route so the tab bar stays and nothing races the
// wish-unlocked screen, which opens after this one is closed.
export function PeriodDoneOverlay({ kid, period, total, coinsToday, onSeeWishes, onKeepGoing }: PeriodDoneOverlayProps) {
  const large = useLargeScreen();
  const { playTap } = useSound();
  const { width, height } = useWindowDimensions();
  // Held sideways (the frame, a phone in landscape) there is no room for the
  // whole column, so the kid and the title go left and the jar and buttons right.
  const landscape = width > height;
  const photoSize = large ? PHOTO_SIZE_LARGE : PHOTO_SIZE;

  return (
    // Fades in as the card springs up from smaller.
    <SpringIn
      shown
      animate
      from={1}
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <LinearGradient colors={GRADIENT} style={StyleSheet.absoluteFill} />
      {/* A few bits of party scattered on the background, like the mockup. */}
      {SCATTER.map((item, index) => (
        <Text
          key={index}
          pointerEvents="none"
          style={[styles.scatter, { fontSize: large ? item.size * 1.3 : item.size }, item.position]}
        >
          {item.emoji}
        </Text>
      ))}
      <ScrollView contentContainerStyle={[styles.content, landscape && styles.contentLandscape]}>
        <SpringIn shown animate from={0.7} style={[styles.card, landscape && styles.cardLandscape]}>
          <View style={[styles.column, landscape && styles.columnLandscape]}>
            <View style={styles.photoBox}>
              <View style={[styles.ring, { width: photoSize + 16, height: photoSize + 16, borderRadius: (photoSize + 16) / 2 }]}>
                {kid.photoUri ? (
                  <Image
                    source={{ uri: kid.photoUri }}
                    style={{ width: photoSize, height: photoSize, borderRadius: photoSize / 2 }}
                  />
                ) : (
                  <View
                    style={[styles.photoEmpty, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]}
                  >
                    <Text style={{ fontSize: photoSize * 0.55 }}>🙂</Text>
                  </View>
                )}
              </View>
              <Wiggle active style={[styles.crown, large && styles.crownLarge]}>
                <Text style={[styles.crownText, large && styles.crownTextLarge]}>👑</Text>
              </Wiggle>
            </View>
            <Text style={[styles.title, large && styles.titleLarge]}>
              {PERIOD_LABELS[period]} done, {kid.name}!
            </Text>
            <Text style={[styles.subtitle, large && styles.subtitleLarge]}>You filled the jar!</Text>
            {landscape ? (
              <Text style={[styles.today, large && styles.todayLarge]} accessibilityLabel={`${coinsToday} coins today`}>
                +{coinsToday} 🪙 today
              </Text>
            ) : null}
          </View>
          <View style={[styles.column, landscape && styles.columnLandscape]}>
            <CoinJar done={total} total={total} size={large ? JAR_SIZE_LARGE : JAR_SIZE} style={styles.jar} />
            {landscape ? null : (
              <Text style={[styles.today, large && styles.todayLarge]} accessibilityLabel={`${coinsToday} coins today`}>
                +{coinsToday} 🪙 today
              </Text>
            )}
            <Pressable
              style={({ pressed }) => [styles.button, large && styles.buttonLarge, pressed && styles.pressed]}
              onPress={() => {
                playTap();
                onSeeWishes();
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, large && styles.buttonTextLarge]}>🎁 See my wishes</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.later, large && styles.laterLarge, pressed && styles.pressed]}
              onPress={() => {
                playTap();
                onKeepGoing();
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.laterText, large && styles.buttonTextLarge]}>Keep going</Text>
            </Pressable>
          </View>
        </SpringIn>
      </ScrollView>
      {/* Mounted fresh each time it opens, so one burst as it appears. */}
      <Celebration burst={1} size={large ? 44 : 34} count={24} />
    </SpringIn>
  );
}

const GRADIENT = ['#FFE27A', '#FFF0B8', '#FFF9E6'] as const;
const PHOTO_SIZE = 120;
const PHOTO_SIZE_LARGE = 160;
const JAR_SIZE = 200;
const JAR_SIZE_LARGE = 260;

const SCATTER = [
  { emoji: '🎉', size: 34, position: { top: '6%', left: '6%' } },
  { emoji: '⭐', size: 30, position: { top: '8%', right: '8%' } },
  { emoji: '🎈', size: 32, position: { top: '28%', right: '10%' } },
  { emoji: '✨', size: 28, position: { top: '48%', left: '5%' } },
  { emoji: '🎊', size: 34, position: { top: '58%', right: '5%' } },
  { emoji: '🌟', size: 28, position: { bottom: '8%', left: '10%' } },
] as const;

const styles = StyleSheet.create({
  scatter: { position: 'absolute', opacity: 0.9 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    // In landscape and on a frame, full-width buttons look stretched.
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  // Two columns side by side in landscape, one under the other upright.
  contentLandscape: { maxWidth: 1040, paddingVertical: spacing.md },
  card: { alignItems: 'center', gap: spacing.sm },
  cardLandscape: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  column: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  columnLandscape: { flex: 1, alignSelf: 'auto' },
  photoBox: { alignItems: 'center', paddingTop: spacing.lg },

  ring: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...offsetShadow('rgba(61, 44, 46, 0.18)', 6),
  },
  photoEmpty: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  // Sits on the top of the ring, tipped a little.
  crown: { position: 'absolute', top: -2, transform: [{ rotate: '-8deg' }] },
  crownLarge: { top: -10 },
  crownText: { fontSize: 56, lineHeight: 64 },
  crownTextLarge: { fontSize: 76, lineHeight: 86 },
  title: { ...typography.hero, fontSize: 40, lineHeight: 46, color: colors.text, textAlign: 'center', marginTop: spacing.xs },
  titleLarge: { fontSize: 52, lineHeight: 60 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 22, color: colors.text, textAlign: 'center' },
  subtitleLarge: { fontSize: 28 },
  jar: { marginVertical: spacing.sm },
  today: { fontFamily: fonts.display, fontSize: 36, lineHeight: 42, color: colors.primaryDark, textAlign: 'center' },
  todayLarge: { fontSize: 46, lineHeight: 54 },
  button: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.surface,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
    marginTop: spacing.md,
    ...offsetShadow(colors.primaryDark, 6),
  },
  buttonLarge: { paddingVertical: spacing.md + 4 },
  pressed: { transform: [{ scale: 0.97 }] },
  buttonText: { ...typography.heading, color: colors.surface },
  buttonTextLarge: { fontSize: 28, lineHeight: 34 },
  // A white twin of the button, for staying on the tasks.
  later: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.surface,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
    ...offsetShadow('rgba(0, 0, 0, 0.12)', 6),
  },
  laterLarge: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl + 8 },
  laterText: { ...typography.heading, color: colors.text },
});
