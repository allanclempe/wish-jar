import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wiggle } from '../../src/components/Animations';
import { CurrentPeriodTasks } from '../../src/components/CurrentPeriodTasks';
import { EmptyState } from '../../src/components/EmptyState';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { colors, spacing } from '../../src/theme';

export default function HomeScreen() {
  const { kids, activeKid } = useActiveKid();

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.container}>
        {activeKid ? (
          <CurrentPeriodTasks />
        ) : (
          <EmptyState
            emoji={
              <Wiggle active>
                <Text style={styles.emoji}>🫙</Text>
              </Wiggle>
            }
            title="Welcome to Wish Jar!"
            text={
              kids.length > 0
                ? 'Tap your picture at the top to start!'
                : 'Grown-ups: tap the 🔒 at the top to add your kids, tasks and wishes.'
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  emoji: { fontSize: 80 },
});
