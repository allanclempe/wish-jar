import type { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { KidSwitcher } from '../kids/KidSwitcher';
import { useNativeDriver } from './Animations';
import { colors, radius, shadow, spacing } from '../theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TAB_WIDTH = 96;
const TAB_HEIGHT = 64;
const TAB_GAP = spacing.xs;

// On large screens there is plenty of room across the top, so the tabs join
// the kids, coins and lock in one bar instead of a thin strip at the bottom.
// They are one toggle, icons only, and the filled-in thumb slides to the chosen one.
export function TopTabBar({ state, descriptors, navigation }: TabBarProps) {
  const [slide] = useState(() => new Animated.Value(state.index));

  useEffect(() => {
    Animated.spring(slide, { toValue: state.index, friction: 8, tension: 90, useNativeDriver }).start();
  }, [state.index, slide]);

  const tabs = (
    <View style={styles.tabs} accessibilityRole="tablist">
      <Animated.View
        style={[styles.thumb, { transform: [{ translateX: Animated.multiply(slide, TAB_WIDTH + TAB_GAP) }] }]}
      />
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
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
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
    gap: TAB_GAP,
    padding: TAB_GAP,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.border,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    borderRadius: radius.pill,
  },
  // Inside the border, so it lines up with the first tab at translateX 0.
  thumb: {
    position: 'absolute',
    top: TAB_GAP,
    left: TAB_GAP,
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    borderRadius: radius.pill,
    // White, so the colourful emoji stand out on it.
    backgroundColor: colors.surface,
    ...shadow,
  },
  pressed: { transform: [{ scale: 0.94 }] },
});
