import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '../../src/theme';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome! 👋</Text>
        <View style={styles.card}>
          <Text style={styles.cardEmoji}>✨</Text>
          <Text style={styles.cardText}>
            Your adventure starts here. Add your first feature to this screen.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  title: { ...typography.title, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  cardEmoji: { fontSize: 48 },
  cardText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
