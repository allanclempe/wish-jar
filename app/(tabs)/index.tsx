import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrentPeriodTasks } from '../../src/components/CurrentPeriodTasks';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { colors, spacing, typography } from '../../src/theme';

export default function HomeScreen() {
  const { activeKid } = useActiveKid();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>
          {activeKid ? `Hi, ${activeKid.name}! 👋` : 'Welcome! 👋'}
        </Text>
        <CurrentPeriodTasks />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  title: { ...typography.title, color: colors.text },
});
