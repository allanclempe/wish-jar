import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabToggle, type TabBarProps } from './TabToggle';
import { colors, spacing } from '../theme';

// Upright phones have no room for the tabs in the kids bar, so the same toggle sits
// at the bottom, in reach of a thumb.
export function BottomTabBar(props: TabBarProps) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.bar}>
      <TabToggle {...props} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
});
