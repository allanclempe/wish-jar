import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { useNativeDriver } from '../../src/components/Animations';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { TopTabBar } from '../../src/components/TopTabBar';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { KidSwitcher } from '../../src/kids/KidSwitcher';
import { useLargeScreen } from '../../src/theme';

// Brightens when its tab is chosen. It stays one size: the toggle's sliding
// thumb already shows the choice, and a bigger icon would sit off-centre in it.
function TabEmoji({ emoji, focused }: { emoji: string; focused: boolean }) {
  const large = useLargeScreen();
  const [focus] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.spring(focus, {
      toValue: focused ? 1 : 0,
      friction: 8,
      tension: 90,
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
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

export default function TabsLayout() {
  const { ready } = useActiveKid();
  const large = useLargeScreen();

  if (!ready) {
    return null;
  }

  return (
    <Tabs
      // The tabs are one toggle: in the kids bar on large screens, at the bottom on phones.
      tabBar={(props) => (large ? <TopTabBar {...props} /> : <BottomTabBar {...props} />)}
      screenOptions={{
        headerShown: !large,
        header: () => <KidSwitcher />,
        tabBarPosition: large ? 'top' : 'bottom',
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
        name="consequences"
        options={{
          title: 'Consequences',
          tabBarIcon: ({ focused }) => <TabEmoji emoji="⚖️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 26 },
  emojiLarge: { fontSize: 34 },
});
