// Each weight from its own entry point, so only these four files ship, not
// every weight of both families.
import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold';
import { Fredoka_500Medium } from '@expo-google-fonts/fredoka/500Medium';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LargeHeader } from '../src/components/LargeHeader';
import { ActiveKidProvider } from '../src/kids/ActiveKidProvider';
import { DatabaseProvider } from '../src/db/provider';
import { ParentLockProvider, useParentLock } from '../src/parent/ParentLockProvider';
import { frameoPhotos } from '../src/photos/frameo';
import { PhotoPickerProvider } from '../src/photos/PhotoPicker';
import { IdleSlideshow } from '../src/photos/Slideshow';
import { SoundProvider } from '../src/sound/SoundProvider';
import { colors, fonts, useLargeScreen } from '../src/theme';

// The splash stays up until the fonts are in, so the first screen never shows
// the platform font.
SplashScreen.preventAutoHideAsync();

const headerStyle = {
  headerShown: true,
  headerTintColor: colors.text,
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
  headerBackTitleStyle: { fontFamily: fonts.semibold },
};

function page(title: string) {
  return { ...headerStyle, title };
}

function modal(title: string) {
  return { ...headerStyle, title, presentation: 'modal' as const };
}

export default function RootLayout() {
  // Loaded at runtime rather than through the config plugin, so the family
  // names are the same on every platform, the web export included.
  const [fontsLoaded, fontsError] = useFonts({
    Baloo2_800ExtraBold,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <ActiveKidProvider>
          <ParentLockProvider>
            <SoundProvider>
              <PhotoPickerProvider>
                <StatusBar style="dark" />
                <RootStack />
                {frameoPhotos ? <IdleSlideshow /> : null}
              </PhotoPickerProvider>
            </SoundProvider>
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
        <Stack.Screen name="edit-wish" options={modal('Edit a wish')} />
        <Stack.Screen name="consequence-types" options={page('Consequences')} />
        <Stack.Screen name="add-consequence-type" options={modal('Add a consequence')} />
        <Stack.Screen name="edit-consequence-type" options={modal('Edit a consequence')} />
        <Stack.Screen name="add-consequence" options={modal('Pick a consequence')} />
      </Stack.Protected>
    </Stack>
  );
}
