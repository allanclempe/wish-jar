import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNativeDriver } from '../../src/components/Animations';
import { TopTabBar } from '../../src/components/TopTabBar';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { KidSwitcher } from '../../src/kids/KidSwitcher';
import { colors, useLargeScreen } from '../../src/theme';

// Jumps and grows when its tab is chosen.
function TabEmoji({ emoji, focused }: { emoji: string; focused: boolean }) {
  const large = useLargeScreen();
  const [focus] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.spring(focus, {
      toValue: focused ? 1 : 0,
      friction: 4,
      tension: 120,
      useNativeDriver,
    }).start();
  }, [focused, focus]);

  return (
    <Animated.Text
      style={[
        styles.emoji,
        large && styles.emojiLarge,
        {
          opacity: focus.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
          transform: [
            { scale: focus.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) },
            { translateY: focus.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
          ],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

export default function TabsLayout() {
  const { ready } = useActiveKid();
  const insets = useSafeAreaInsets();
  const large = useLargeScreen();

  if (!ready) {
    return null;
  }

  return (
    <Tabs
      // Large screens move the tabs up into the kids bar (TopTabBar).
      tabBar={large ? (props) => <TopTabBar {...props} /> : undefined}
      screenOptions={{
        headerShown: !large,
        header: () => <KidSwitcher />,
        tabBarPosition: large ? 'top' : 'bottom',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 2,
          height: 76 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '800' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ focused }) => <TabEmoji emoji="🧹" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: 'Wishes',
          tabBarIcon: ({ focused }) => <TabEmoji emoji="🎁" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="punishments"
        options={{
          title: 'Punishments',
          tabBarIcon: ({ focused }) => <TabEmoji emoji="🚫" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 26 },
  emojiLarge: { fontSize: 34 },
});
