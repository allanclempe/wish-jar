import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { SpringTo } from '../../src/components/Animations';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { TopTabBar } from '../../src/components/TopTabBar';
import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { KidSwitcher } from '../../src/kids/KidSwitcher';
import { useLargeScreen, useTabsOnTop } from '../../src/theme';

// Brightens when its tab is chosen. It stays one size: the toggle's sliding
// thumb already shows the choice, and a bigger icon would sit off-centre in it.
function TabEmoji({ emoji, focused }: { emoji: string; focused: boolean }) {
  const large = useLargeScreen();

  return (
    <SpringTo to={{ opacity: focused ? 1 : 0.55 }}>
      <Text style={[styles.emoji, large && styles.emojiLarge]}>{emoji}</Text>
    </SpringTo>
  );
}

export default function TabsLayout() {
  const { ready } = useActiveKid();
  const onTop = useTabsOnTop();

  if (!ready) {
    return null;
  }

  return (
    <Tabs
      // The tabs are one toggle: in the kids bar on large screens and in
      // landscape, at the bottom on upright phones and narrow windows.
      tabBar={(props) => (onTop ? <TopTabBar {...props} /> : <BottomTabBar {...props} />)}
      screenOptions={{
        headerShown: !onTop,
        header: () => <KidSwitcher />,
        tabBarPosition: onTop ? 'top' : 'bottom',
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
