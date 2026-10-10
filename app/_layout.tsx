import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveKidProvider } from '../src/kids/ActiveKidProvider';
import { DatabaseProvider } from '../src/db/provider';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <ActiveKidProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="add-kid"
              options={{
                presentation: 'modal',
                headerShown: true,
                title: 'Add a kid',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen
              name="add-task"
              options={{
                presentation: 'modal',
                headerShown: true,
                title: 'Add a task',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
          </Stack>
        </ActiveKidProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
