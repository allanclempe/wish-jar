import type { Tabs } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { useSound } from '../sound/SoundProvider';
import { colors, fonts, offsetShadow, radius, spacing, useLargeScreen } from '../theme';
import { SpringTo } from './Animations';

export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0] & {
  // Fill the width available, each tab an equal share: the bottom bar on phones.
  stretch?: boolean;
};

const TAB_GAP = spacing.xs;

type TabLayout = { x: number; width: number };

// The tabs as one chunky toggle, an emoji and a label each: an orange thumb
// slides under the chosen one. Large screens show it in the kids bar
// (TopTabBar), phones at the bottom (BottomTabBar).
export function TabToggle({ state, descriptors, navigation, stretch = false }: TabBarProps) {
  const large = useLargeScreen();
  const { playTap } = useSound();
  // The tabs are as wide as their labels, so the thumb follows their measured
  // positions rather than a fixed width.
  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({});

  const focusedKey = state.routes[state.index]?.key;
  const target = focusedKey ? layouts[focusedKey] : undefined;

  function measure(key: string) {
    return ({ nativeEvent }: LayoutChangeEvent) => {
      const { x, width: tabWidth } = nativeEvent.layout;
      setLayouts((previous) => {
        const known = previous[key];
        if (known && known.x === x && known.width === tabWidth) return previous;
        return { ...previous, [key]: { x, width: tabWidth } };
      });
    };
  }

  return (
    <View style={[styles.tabs, stretch && styles.tabsStretch]} accessibilityRole="tablist">
      {/* No border or padding here, so the measured x of a tab is where the thumb goes. */}
      <View style={styles.track}>
        {/* Once the tab is measured the thumb appears under it, then slides to each new one. */}
        {target ? <SpringTo to={{ left: target.x, width: target.width }} style={styles.thumb} /> : null}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = focused ? colors.surface : colors.textMuted;

          function press() {
            playTap();
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          }

          return (
            <Pressable
              key={route.key}
              onPress={press}
              onLayout={measure(route.key)}
              style={({ pressed }) => [
                styles.tab,
                large && styles.tabLarge,
                stretch && styles.tabStretch,
                pressed && styles.pressed,
              ]}
              hitSlop={spacing.xs}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.title}
            >
              {options.tabBarIcon?.({ focused, color, size: 34 })}
              <Text style={[styles.label, large && styles.labelLarge, { color }]} numberOfLines={1}>
                {options.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    padding: TAB_GAP,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  tabsStretch: { alignSelf: 'stretch' },
  track: { flexDirection: 'row', gap: TAB_GAP },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
  },
  tabLarge: { minHeight: 56, paddingHorizontal: spacing.lg - 4 },
  tabStretch: { flex: 1, paddingHorizontal: spacing.xs + 2, gap: spacing.xs + 2 },
  label: { fontFamily: fonts.bold, fontSize: 14 },
  labelLarge: { fontSize: 17 },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    ...offsetShadow(colors.primaryDark, 3),
  },
  pressed: { transform: [{ scale: 0.94 }] },
});
