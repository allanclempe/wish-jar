import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpringTo, Squish } from '../components/Animations';
import { BonusCoinsButton, ParentLockButton } from '../parent/ParentLockButton';
import { useSound } from '../sound/SoundProvider';
import { useActiveKid, useSavings } from './ActiveKidProvider';
import { shownPhoto } from '../photos/photos';
import { colors, fonts, offsetShadow, radius, spacing, sunshineShadow, typography, useLargeScreen } from '../theme';

type KidSwitcherProps = {
  // On large screens and in landscape the tabs sit in this bar instead of at the bottom.
  tabs?: ReactNode;
};

export function KidSwitcher({ tabs }: KidSwitcherProps) {
  const { kids, activeKid, selectKid } = useActiveKid();
  const { playTap } = useSound();
  const large = useLargeScreen();

  // The new kid stays on the tab that's open, so kids taking turns on the
  // wishes tab each see their own.
  function switchTo(kidId: number) {
    playTap();
    if (kidId === activeKid?.id) return;
    selectKid(kidId);
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={[styles.bar, large && styles.barLarge]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          style={styles.scroll}
        >
          {kids.map((kid) => (
            <KidAvatar
              key={kid.id}
              name={kid.name}
              photoUri={kid.photoUri}
              active={kid.id === activeKid?.id}
              large={large}
              onPress={() => switchTo(kid.id)}
            />
          ))}
        </ScrollView>
        {tabs}
        {activeKid ? <CoinCounter kidId={activeKid.id} large={large} /> : null}
        {activeKid ? <BonusCoinsButton /> : null}
        <ParentLockButton />
      </View>
    </SafeAreaView>
  );
}

type KidAvatarProps = {
  name: string;
  photoUri: string | null;
  active: boolean;
  large: boolean;
  onPress: () => void;
};

function KidAvatar({ name, photoUri, active, large, onPress }: KidAvatarProps) {
  const shown = shownPhoto(photoUri);
  return (
    <Pressable
      style={styles.kid}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: active }}
    >
      <SpringTo
        bouncy
        to={{ opacity: active ? 1 : 0.55, scale: active ? 1.08 : 0.85 }}
        style={[styles.ring, large && styles.ringLarge, active && styles.ringActive]}
      >
        {shown ? (
          <Image
            source={{ uri: shown }}
            style={[styles.avatar, large && styles.avatarLarge, active && styles.avatarActive]}
          />
        ) : (
          <View style={[styles.avatar, large && styles.avatarLarge, styles.avatarEmpty, active && styles.avatarActive]}>
            <Text style={[styles.avatarEmoji, large && styles.avatarEmojiLarge]}>🙂</Text>
          </View>
        )}
      </SpringTo>
      <Text style={[styles.name, large && styles.nameLarge, active && styles.nameActive]} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

// Bounces whenever the count goes up, so earning a coin is felt up here too.
// It reads the savings itself, so a tick re-renders only the counter.
function CoinCounter({ kidId, large }: { kidId: number; large: boolean }) {
  const coins = useSavings()[kidId] ?? 0;
  // How many times the count has gone up, noted while rendering.
  const [last, setLast] = useState(coins);
  const [ups, setUps] = useState(0);
  if (coins !== last) {
    setLast(coins);
    if (coins > last) setUps(ups + 1);
  }

  return (
    <Squish
      play={ups}
      from={1.5}
      style={[styles.coins, large && styles.coinsLarge]}
      accessibilityLabel={`${coins} ${coins === 1 ? 'coin' : 'coins'}`}
    >
      <Text style={[styles.coinsText, large && styles.coinsTextLarge]}>🪙 {coins}</Text>
    </Squish>
  );
}

const AVATAR_SIZE = 52;
const AVATAR_SIZE_LARGE = 84;

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.surface, borderBottomWidth: 3, borderBottomColor: colors.border },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md, minHeight: 64 },
  barLarge: { gap: spacing.md, paddingRight: spacing.lg, minHeight: 112 },
  scroll: { flex: 1 },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  // White inside, so the gold coin stands out; the yellow rim and its darker
  // shadow make it a chunky coin of its own.
  coins: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.md,
    borderWidth: 3,
    borderColor: colors.sunshine,
    ...sunshineShadow,
  },
  coinsLarge: { paddingVertical: spacing.xs, paddingHorizontal: spacing.lg - 2 },
  coinsText: { fontFamily: fonts.display, fontSize: 26, lineHeight: 36, color: colors.text },
  coinsTextLarge: { fontSize: 34, lineHeight: 46 },
  kid: { alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.border,
  },
  avatarLarge: { width: AVATAR_SIZE_LARGE, height: AVATAR_SIZE_LARGE, borderRadius: AVATAR_SIZE_LARGE / 2 },
  avatarActive: { borderColor: colors.primary, borderWidth: 4 },
  // The shadow sits on the wrapper, which has the avatar's round shape, so it
  // follows the pop animation.
  ring: { borderRadius: AVATAR_SIZE / 2 },
  ringLarge: { borderRadius: AVATAR_SIZE_LARGE / 2 },
  ringActive: { ...offsetShadow(colors.primaryDark, 3) },
  avatarEmpty: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 26 },
  avatarEmojiLarge: { fontSize: 44 },
  name: { ...typography.caption, fontFamily: fonts.semibold, color: colors.textMuted, maxWidth: 72 },
  nameLarge: { fontSize: 18, maxWidth: 110 },
  nameActive: { color: colors.text, fontFamily: fonts.bold },
});
