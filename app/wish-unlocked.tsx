import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Celebration, FadeInUp, Wiggle } from '../src/components/Animations';
import { IconBadge } from '../src/components/Icons';
import { listWishes, useDatabase, type Wish } from '../src/db';
import { colors, offsetShadow, radius, spacing, sunshineShadow, typography } from '../src/theme';

// Shown when a task tick gives the kid enough coins for one or more wishes.
// `ids` is the comma-separated list of wishes it unlocked.
export default function WishUnlockedScreen() {
  const db = useDatabase();
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    const wanted = new Set(String(ids ?? '').split(',').map(Number));
    let cancelled = false;
    listWishes(db).then((loaded) => {
      if (cancelled) return;
      setWishes(loaded.filter((wish) => wanted.has(wish.id)));
      setBurst((count) => count + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [db, ids]);

  const many = wishes.length > 1;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Wiggle active>
          <Text style={styles.trophy}>🏆</Text>
        </Wiggle>
        <Text style={styles.title}>{many ? 'Wishes unlocked!' : 'Wish unlocked!'}</Text>
        <Text style={styles.subtitle}>
          {many
            ? 'You saved enough coins for these. Pick one to get!'
            : 'You saved enough coins for it. You can get:'}
        </Text>

        {wishes.map((wish, index) => (
          <FadeInUp key={wish.id} index={index} style={styles.wish}>
            <IconBadge icon={wish.icon} fallbackEmoji="🎁" size={96} />
            <Text style={styles.name}>{wish.name}</Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>🪙 {wish.coinAmount}</Text>
            </View>
          </FadeInUp>
        ))}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => router.dismissTo('/wishlist')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>🎁 Go to my wishes</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.later, pressed && styles.pressed]}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.laterText}>Keep doing tasks</Text>
        </Pressable>
      </ScrollView>
      <Celebration burst={burst} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFBEA' },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    // In landscape and on a frame, a full-width wish card and button look stretched.
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  trophy: { fontSize: 96 },
  title: { ...typography.hero, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  wish: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 4,
    borderColor: colors.sunshine,
    padding: spacing.lg,
    ...sunshineShadow,
  },
  name: { ...typography.title, color: colors.text, textAlign: 'center' },
  // White with a yellow rim, like the coin counter, so the gold coin stands out.
  pill: {
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.sunshine,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs - 3,
    ...sunshineShadow,
  },
  pillText: { ...typography.heading, color: colors.text },
  button: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.surface,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...offsetShadow(colors.primaryDark, 6),
  },
  pressed: { transform: [{ scale: 0.97 }] },
  buttonText: { ...typography.heading, color: colors.surface },
  // A white twin of the button, for the way back to the tasks.
  later: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.surface,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
    ...offsetShadow('rgba(0, 0, 0, 0.12)', 6),
  },
  laterText: { ...typography.heading, color: colors.text },
});
