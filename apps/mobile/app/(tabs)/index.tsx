import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wiggle } from '../../src/components/Animations';
import { CurrentPeriodTasks } from '../../src/components/CurrentPeriodTasks';
import { EmptyState } from '../../src/components/EmptyState';
import { HiddenWhenBlurred } from '../../src/components/HiddenWhenBlurred';
import { Sky } from '../../src/components/Sky';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { useClock } from '../../src/tasks/useClock';
import { skies } from '../../src/theme';

export default function HomeTab() {
  return (
    <HiddenWhenBlurred>
      <HomeScreen />
    </HiddenWhenBlurred>
  );
}

// Memoized: expo-router re-renders the tab's route on every tab switch, and
// on the frame redrawing a whole screen for that was most of the switch.
const HomeScreen = memo(function HomeScreen() {
  const { kids, activeKid } = useActiveKid();
  const { period, day } = useClock();
  const sky = skies[period];

  // The sky fills the whole tab, under the safe area too; the list and the
  // empty state carry their own gutters.
  return (
    <View style={styles.container}>
      <Sky period={period} />
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
        {activeKid ? (
          <CurrentPeriodTasks period={period} day={day} />
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
            titleColor={sky.title}
            textColor={sky.subtitle}
          />
        )}
      </SafeAreaView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  emoji: { fontSize: 80 },
});
