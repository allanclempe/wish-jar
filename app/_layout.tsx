import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LargeHeader } from '../src/components/LargeHeader';
import { ActiveKidProvider } from '../src/kids/ActiveKidProvider';
import { DatabaseProvider } from '../src/db/provider';
import { ParentLockProvider, useParentLock } from '../src/parent/ParentLockProvider';
import { frameoPhotos } from '../src/photos/frameo';
import { PhotoPickerProvider } from '../src/photos/PhotoPicker';
import { IdleSlideshow } from '../src/photos/Slideshow';
import { colors, useLargeScreen } from '../src/theme';

const headerStyle = {
  headerShown: true,
  headerTintColor: colors.text,
  headerStyle: { backgroundColor: colors.surface },
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
            <PhotoPickerProvider>
              <StatusBar style="dark" />
              <RootStack />
              {frameoPhotos ? <IdleSlideshow /> : null}
            </PhotoPickerProvider>
          </ParentLockProvider>
        </ActiveKidProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { unlocked } = useParentLock();
  const large = useLargeScreen();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Bigger back button and title on tablets and photo frames.
        header: large ? (props) => <LargeHeader {...props} /> : undefined,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="wish-unlocked"
        options={{ presentation: 'fullScreenModal', animation: 'fade' }}
      />
      {/* Everything a grown-up sets up needs the PIN first. */}
      <Stack.Protected guard={unlocked}>
        <Stack.Screen name="settings" options={page('Grown-ups')} />
        <Stack.Screen name="change-pin" options={modal('Change PIN')} />
        <Stack.Screen name="timezone" options={modal('Timezone')} />
        <Stack.Screen name="add-kid" options={modal('Add a kid')} />
        <Stack.Screen name="kids" options={page('Kids')} />
        <Stack.Screen name="edit-kid" options={modal('Edit a kid')} />
        <Stack.Screen name="tasks" options={page('Tasks')} />
        <Stack.Screen name="add-task" options={modal('Add a task')} />
        <Stack.Screen name="edit-task" options={modal('Edit a task')} />
        <Stack.Screen name="wishes" options={page('Wishes')} />
        <Stack.Screen name="add-wish" options={modal('Add a wish')} />
        <Stack.Screen name="consequence-types" options={page('Consequences')} />
        <Stack.Screen name="add-consequence-type" options={modal('Add a consequence')} />
        <Stack.Screen name="edit-consequence-type" options={modal('Edit a consequence')} />
        <Stack.Screen name="add-consequence" options={modal('Pick a consequence')} />
      </Stack.Protected>
    </Stack>
  );
}
