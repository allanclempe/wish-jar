import { router } from 'expo-router';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { colors, radius, spacing, typography } from '../src/theme';

export default function KidsScreen() {
  const { kids, activeKid } = useActiveKid();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <FlatList
          data={kids}
          keyExtractor={(kid) => String(kid.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.card}>
              <Text style={styles.cardEmoji}>🙂</Text>
              <Text style={styles.cardText}>No kids yet. Add one below to get started!</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isActive = item.id === activeKid?.id;
            return (
              <Pressable
                style={[styles.row, isActive && styles.rowActive]}
                onPress={() => router.push({ pathname: '/edit-kid', params: { id: String(item.id) } })}
                accessibilityRole="button"
              >
                {item.photoUri ? (
                  <Image source={{ uri: item.photoUri }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Text style={styles.avatarEmoji}>🙂</Text>
                  </View>
                )}
                <Text style={styles.name}>{item.name}</Text>
                {isActive ? (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>Playing</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />

        <Pressable
          style={styles.button}
          onPress={() => router.push('/add-kid')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>＋ Add a kid</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 64;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.md, flexGrow: 1 },
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
  rowActive: { borderColor: colors.success },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.border,
  },
  avatarEmpty: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 30 },
  name: { ...typography.heading, color: colors.text, flex: 1 },
  pill: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: colors.text },
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
