import type { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useNativeDriver } from './Animations';
import { colors, radius, shadow, spacing, useLargeScreen } from '../theme';

export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TAB_GAP = spacing.xs;
const SIZES = {
  phone: { width: 88, height: 52 },
  large: { width: 96, height: 64 },
};

// The tabs as one toggle, icons only: a white thumb slides to the chosen one.
// Large screens show it in the kids bar (TopTabBar), phones at the bottom
// (BottomTabBar).
export function TabToggle({ state, descriptors, navigation }: TabBarProps) {
  const size = useLargeScreen() ? SIZES.large : SIZES.phone;
  const [slide] = useState(() => new Animated.Value(state.index));

  useEffect(() => {
    Animated.spring(slide, { toValue: state.index, friction: 8, tension: 90, useNativeDriver }).start();
  }, [state.index, slide]);

  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      <Animated.View
        style={[
          styles.thumb,
          size,
          { transform: [{ translateX: Animated.multiply(slide, size.width + TAB_GAP) }] },
        ]}
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
            style={({ pressed }) => [styles.tab, size, pressed && styles.pressed]}
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
  tab: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  // Inside the border, so it lines up with the first tab at translateX 0.
  thumb: {
    position: 'absolute',
    top: TAB_GAP,
    left: TAB_GAP,
    borderRadius: radius.pill,
    // White, so the colourful emoji stand out on it.
    backgroundColor: colors.surface,
    ...shadow,
  },
  pressed: { transform: [{ scale: 0.94 }] },
});
