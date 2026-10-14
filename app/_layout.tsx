import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveKidProvider } from '../src/kids/ActiveKidProvider';
import { DatabaseProvider } from '../src/db/provider';
import { ParentLockProvider, useParentLock } from '../src/parent/ParentLockProvider';
import { colors } from '../src/theme';

const headerStyle = {
  headerShown: true,
  headerTintColor: colors.text,
  headerStyle: { backgroundColor: colors.background },
};

function page(title: string) {
  return { ...headerStyle, title };
}

function modal(title: string) {
  return { ...headerStyle, title, presentation: 'modal' as const };
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <ActiveKidProvider>
          <ParentLockProvider>
            <StatusBar style="dark" />
            <RootStack />
          </ParentLockProvider>
        </ActiveKidProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { unlocked } = useParentLock();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      {/* Everything a grown-up sets up needs the PIN first. */}
      <Stack.Protected guard={unlocked}>
        <Stack.Screen name="settings" options={page('Grown-ups')} />
        <Stack.Screen name="change-pin" options={modal('Change PIN')} />
        <Stack.Screen name="add-kid" options={modal('Add a kid')} />
        <Stack.Screen name="kids" options={page('Kids')} />
        <Stack.Screen name="edit-kid" options={modal('Edit a kid')} />
        <Stack.Screen name="tasks" options={page('Tasks')} />
        <Stack.Screen name="add-task" options={modal('Add a task')} />
        <Stack.Screen name="edit-task" options={modal('Edit a task')} />
        <Stack.Screen name="wishes" options={page('Wishes')} />
        <Stack.Screen name="add-wish" options={modal('Add a wish')} />
        <Stack.Screen name="punishment-types" options={page('Punishments')} />
        <Stack.Screen name="add-punishment-type" options={modal('Add a punishment')} />
        <Stack.Screen name="edit-punishment-type" options={modal('Edit a punishment')} />
        <Stack.Screen name="add-punishment" options={modal('What did they do?')} />
      </Stack.Protected>
    </Stack>
  );
}
