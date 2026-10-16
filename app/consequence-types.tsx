import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconBadge } from '../src/components/Icons';
import { listConsequenceTypes, useDatabase, type ConsequenceType } from '../src/db';
import { colors, radius, spacing, typography } from '../src/theme';

export default function ConsequencesSettingsScreen() {
  const db = useDatabase();
  const [types, setTypes] = useState<ConsequenceType[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listConsequenceTypes(db).then((loaded) => {
        if (!cancelled) setTypes(loaded);
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
          data={types}
          keyExtractor={(type) => String(type.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.card}>
              <Text style={styles.cardEmoji}>⚖️</Text>
              <Text style={styles.cardText}>
                No consequences yet. Add one below, with what it costs in coins, if anything.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({ pathname: '/edit-consequence-type', params: { id: String(item.id) } })
              }
              accessibilityRole="button"
            >
              <IconBadge icon={item.icon} fallbackEmoji="⚖️" />
              <Text style={styles.name}>{item.name}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {item.coinAmount === 0
                    ? 'No coins'
                    : `−${item.coinAmount} ${item.coinAmount === 1 ? 'coin' : 'coins'}`}
                </Text>
              </View>
            </Pressable>
          )}
        />

        <Pressable
          style={styles.button}
          onPress={() => router.push('/add-consequence-type')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>＋ Add a consequence</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.sm, flexGrow: 1 },
  // Grows to fill the list, but never shrinks below its content on a short screen.
  card: {
    flexGrow: 1,
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
  name: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  pill: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.accent },
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
