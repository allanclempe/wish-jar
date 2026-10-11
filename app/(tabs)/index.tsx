import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrentPeriodTasks } from '../../src/components/CurrentPeriodTasks';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { colors, spacing, typography } from '../../src/theme';

export default function HomeScreen() {
  const { activeKid, savings } = useActiveKid();
  const coins = activeKid ? (savings[activeKid.id] ?? 0) : 0;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>
          {activeKid ? `Hi, ${activeKid.name}! 👋` : 'Welcome! 👋'}
        </Text>
        {activeKid ? (
          <Text style={styles.savings}>
            🪙 {coins} {coins === 1 ? 'coin' : 'coins'} saved
          </Text>
        ) : null}
        <CurrentPeriodTasks />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  title: { ...typography.title, color: colors.text },
  savings: { ...typography.body, color: colors.primary, fontWeight: '700' },
});
