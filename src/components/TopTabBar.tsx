import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { KidSwitcher } from '../kids/KidSwitcher';
import { colors, radius, shadow, spacing } from '../theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// On large screens there is plenty of room across the top, so the tabs join
// the kids, coins and lock in one bar instead of a thin strip at the bottom.
// They are one toggle, icons only, with the chosen one filled in.
export function TopTabBar({ state, descriptors, navigation }: TabBarProps) {
  const tabs = (
    <View style={styles.tabs} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? colors.primary : colors.textMuted;

        function press() {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        }

        return (
          <Pressable
            key={route.key}
            onPress={press}
            style={({ pressed }) => [styles.tab, focused && styles.tabFocused, pressed && styles.pressed]}
            hitSlop={spacing.xs}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.title}
          >
            {options.tabBarIcon?.({ focused, color, size: 34 })}
          </Pressable>
        );
      })}
    </View>
  );

  return <KidSwitcher tabs={tabs} />;
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 96,
    height: 64,
    borderRadius: radius.pill,
  },
  tabFocused: { backgroundColor: colors.primary, ...shadow },
  pressed: { transform: [{ scale: 0.94 }] },
});
