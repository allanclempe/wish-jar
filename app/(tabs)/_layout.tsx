import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNativeDriver } from '../../src/components/Animations';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { KidSwitcher } from '../../src/kids/KidSwitcher';
import { colors } from '../../src/theme';

// Jumps and grows when its tab is chosen.
function TabEmoji({ emoji, focused }: { emoji: string; focused: boolean }) {
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

  if (!ready) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <KidSwitcher />,
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
});
