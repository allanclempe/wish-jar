import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveKid } from '../../src/kids/ActiveKidProvider';
import { KidSwitcher } from '../../src/kids/KidSwitcher';
import { colors } from '../../src/theme';

function TabEmoji({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 26 : 22 }}>{emoji}</Text>;
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
          height: 64 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
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
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabEmoji emoji="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
