import { router } from 'expo-router';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { colors, radius, spacing, typography } from '../../src/theme';

export default function SettingsScreen() {
  const { kids, activeKid } = useActiveKid();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Settings ⚙️</Text>

        <Text style={styles.section}>Kids</Text>
        <FlatList
          data={kids}
          keyExtractor={(kid) => String(kid.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No kids yet. Add one below.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.photoUri ? (
                <Image source={{ uri: item.photoUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <Text style={styles.avatarEmoji}>🙂</Text>
                </View>
              )}
              <Text style={styles.name}>{item.name}</Text>
              {item.id === activeKid?.id ? <Text style={styles.active}>Playing</Text> : null}
            </View>
          )}
        />

        <Pressable
          style={styles.button}
          onPress={() => router.push('/choose-kid')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Switch kid</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.push('/add-kid')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Add a kid</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 56;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  title: { ...typography.title, color: colors.text },
  section: { ...typography.heading, color: colors.text },
  list: { gap: spacing.sm, flexGrow: 1 },
  empty: { ...typography.body, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarEmpty: {
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 28 },
  name: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  active: { ...typography.caption, color: colors.success, fontWeight: '700' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButton: { backgroundColor: colors.secondary },
  buttonText: { ...typography.heading, color: colors.surface },
});
