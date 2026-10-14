import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wiggle } from '../../src/components/Animations';
import { CurrentPeriodTasks } from '../../src/components/CurrentPeriodTasks';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { colors, radius, shadow, spacing, typography } from '../../src/theme';

export default function HomeScreen() {
  const { kids, activeKid } = useActiveKid();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        {activeKid ? (
          <>
            <View style={styles.greeting}>
              <Text style={styles.title}>Hi, {activeKid.name}!</Text>
              <Wiggle active>
                <Text style={styles.wave}>👋</Text>
              </Wiggle>
            </View>
            <CurrentPeriodTasks />
          </>
        ) : (
          <View style={styles.card}>
            <Wiggle active>
              <Text style={styles.cardEmoji}>🫙</Text>
            </Wiggle>
            <Text style={styles.cardTitle}>Welcome to Wish Jar!</Text>
            <Text style={styles.cardText}>
              {kids.length > 0
                ? 'Tap your picture at the top to start!'
                : 'Grown-ups: press and hold the 🔒 at the top to add your kids, tasks and wishes.'}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  greeting: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.hero, color: colors.text, flexShrink: 1 },
  wave: { fontSize: 34 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  cardEmoji: { fontSize: 80 },
  cardTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  cardText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
