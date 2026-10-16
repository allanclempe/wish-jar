import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconBadge } from '../src/components/Icons';
import { listWishes, useDatabase, type Wish } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { EmptyState } from '../src/components/EmptyState';
import { colors, contentMaxWidth, radius, spacing, typography } from '../src/theme';

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
            <EmptyState
              emoji="🎁"
              text="No wishes yet. Add one below so kids can start saving coins!"
            />
          }
          renderItem={({ item }) => {
            const kid = kids.find((candidate) => candidate.id === item.kidId);
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({ pathname: '/edit-wish', params: { id: String(item.id) } })
                }
                accessibilityRole="button"
              >
                <IconBadge icon={item.icon} fallbackEmoji="🎁" />
                <View style={styles.text}>
                  <Text style={styles.name}>{item.name}</Text>
                  {kid ? <Text style={styles.kid}>For {kid.name}</Text> : null}
                  {item.claimedAt != null ? <Text style={styles.kid}>✅ Got it</Text> : null}
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    🪙 {item.coinAmount} {item.coinAmount === 1 ? 'coin' : 'coins'}
                  </Text>
                </View>
              </Pressable>
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
  container: { flex: 1, padding: spacing.lg, gap: spacing.md, width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' },
  list: { gap: spacing.sm, flexGrow: 1 },
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
