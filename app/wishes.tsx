import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconBadge } from '../src/components/Icons';
import { listWishes, useDatabase, type Wish } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { colors, radius, spacing, typography } from '../src/theme';

export default function WishesScreen() {
  const db = useDatabase();
  const { kids } = useActiveKid();
  const [wishes, setWishes] = useState<Wish[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listWishes(db).then((loaded) => {
        if (!cancelled) setWishes(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <FlatList
          data={wishes}
          keyExtractor={(wish) => String(wish.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.card}>
              <Text style={styles.cardEmoji}>🎁</Text>
              <Text style={styles.cardText}>
                No wishes yet. Add one below so kids can start saving coins!
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const kid = kids.find((candidate) => candidate.id === item.kidId);
            return (
              <View style={styles.row}>
                <IconBadge icon={item.icon} fallbackEmoji="🎁" />
                <View style={styles.text}>
                  <Text style={styles.name}>{item.name}</Text>
                  {kid ? <Text style={styles.kid}>For {kid.name}</Text> : null}
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    🪙 {item.coinAmount} {item.coinAmount === 1 ? 'coin' : 'coins'}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <Pressable
          style={styles.button}
          onPress={() => router.push('/add-wish')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>＋ Add a wish</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.sm, flexGrow: 1 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: { fontSize: 48 },
  cardText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  text: { flex: 1, gap: 2 },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  kid: { ...typography.caption, color: colors.textMuted },
  pill: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonText: { ...typography.heading, color: colors.surface },
});
