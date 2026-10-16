import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNativeDriver } from '../components/Animations';
import { ParentLockButton } from '../parent/ParentLockButton';
import { useActiveKid } from './ActiveKidProvider';
import { colors, radius, spacing, typography, useLargeScreen } from '../theme';

type KidSwitcherProps = {
  // On large screens and in landscape the tabs sit in this bar instead of at the bottom.
  tabs?: ReactNode;
};

export function KidSwitcher({ tabs }: KidSwitcherProps) {
  const { kids, activeKid, savings, selectKid } = useActiveKid();
  const coins = activeKid ? (savings[activeKid.id] ?? 0) : 0;
  const large = useLargeScreen();

  // A new kid starts on their tasks, not on the last kid's wishes or consequences.
  function switchTo(kidId: number) {
    if (kidId === activeKid?.id) return;
    selectKid(kidId);
    router.navigate('/');
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
        {activeKid ? <CoinCounter coins={coins} large={large} /> : null}
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
  const [pop] = useState(() => new Animated.Value(active ? 1 : 0));

  useEffect(() => {
    Animated.spring(pop, { toValue: active ? 1 : 0, friction: 4, tension: 120, useNativeDriver }).start();
  }, [active, pop]);

  return (
    <Pressable
      style={styles.kid}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: active }}
    >
      <Animated.View
        style={{
          opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.05] }) }],
        }}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={[styles.avatar, large && styles.avatarLarge, active && styles.avatarActive]}
          />
        ) : (
          <View style={[styles.avatar, large && styles.avatarLarge, styles.avatarEmpty, active && styles.avatarActive]}>
            <Text style={[styles.avatarEmoji, large && styles.avatarEmojiLarge]}>🙂</Text>
          </View>
        )}
      </Animated.View>
      <Text style={[styles.name, large && styles.nameLarge, active && styles.nameActive]} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

// Bounces whenever the count goes up, so earning a coin is felt up here too.
function CoinCounter({ coins, large }: { coins: number; large: boolean }) {
  const [bounce] = useState(() => new Animated.Value(1));
  const previous = useRef(coins);

  useEffect(() => {
    if (coins > previous.current) {
      bounce.setValue(1.5);
      Animated.spring(bounce, { toValue: 1, friction: 3, tension: 140, useNativeDriver }).start();
    }
    previous.current = coins;
  }, [coins, bounce]);

  return (
    <Animated.View
      style={[styles.coins, large && styles.coinsLarge, { transform: [{ scale: bounce }] }]}
      accessibilityLabel={`${coins} ${coins === 1 ? 'coin' : 'coins'}`}
    >
      <Text style={[styles.coinsText, large && styles.coinsTextLarge]}>🪙 {coins}</Text>
    </Animated.View>
  );
}

const AVATAR_SIZE = 52;
const AVATAR_SIZE_LARGE = 84;

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.surface, borderBottomWidth: 2, borderBottomColor: colors.border },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md, minHeight: 64 },
  barLarge: { gap: spacing.md, paddingRight: spacing.lg, minHeight: 112 },
  scroll: { flex: 1 },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  // White inside, so the gold coin stands out; the yellow rim keeps it the coins spot.
  coins: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 3,
    borderColor: colors.sunshine,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  coinsLarge: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  coinsText: { fontSize: 26, fontWeight: '900', color: colors.text },
  coinsTextLarge: { fontSize: 36 },
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
  avatarEmpty: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 26 },
  avatarEmojiLarge: { fontSize: 44 },
  name: { ...typography.caption, color: colors.textMuted, maxWidth: 72 },
  nameLarge: { fontSize: 18, maxWidth: 110 },
  nameActive: { color: colors.text, fontWeight: '800' },
});
