import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabToggle, type TabBarProps } from './TabToggle';
import { colors, spacing } from '../theme';

// Upright phones have no room for the tabs in the kids bar, so the same toggle sits
// at the bottom, across the width of the screen, in reach of a thumb.
export function BottomTabBar(props: TabBarProps) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.bar}>
      <TabToggle {...props} stretch />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 3,
    borderTopColor: colors.border,
  },
});
