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
              name="kids"
              options={{
                headerShown: true,
                title: 'Kids',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen
              name="edit-kid"
              options={{
                presentation: 'modal',
                headerShown: true,
                title: 'Edit a kid',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen
              name="tasks"
              options={{
                headerShown: true,
                title: 'Tasks',
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
            <Stack.Screen
              name="edit-task"
              options={{
                presentation: 'modal',
                headerShown: true,
                title: 'Edit a task',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen
              name="wishes"
              options={{
                headerShown: true,
                title: 'Wishes',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen
              name="add-wish"
              options={{
                presentation: 'modal',
                headerShown: true,
                title: 'Add a wish',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen
              name="punishment-types"
              options={{
                headerShown: true,
                title: 'Punishments',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen
              name="add-punishment-type"
              options={{
                presentation: 'modal',
                headerShown: true,
                title: 'Add a punishment',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen
              name="edit-punishment-type"
              options={{
                presentation: 'modal',
                headerShown: true,
                title: 'Edit a punishment',
                headerTintColor: colors.text,
                headerStyle: { backgroundColor: colors.background },
              }}
            />
            <Stack.Screen
              name="add-punishment"
              options={{
                presentation: 'modal',
                headerShown: true,
                title: 'What did they do?',
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
