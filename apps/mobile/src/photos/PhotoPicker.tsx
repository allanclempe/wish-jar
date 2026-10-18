import * as ImagePicker from 'expo-image-picker';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { onEchoShow, onFrame } from '../device/host';
import { useParentLock } from '../parent/ParentLockProvider';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { PhonePhotoSheet } from './PhonePhotoSheet';

// Resolves with the picked photo's URI, or null when the grown-up backs out.
export type PickPhoto = () => Promise<string | null>;

const PhotoPickerContext = createContext<PickPhoto>(pickFromLibrary);

// How a kid's or an icon's photo is chosen: from the device's photo library,
// or on the Frameo frame and the Echo Show, sent from a parent's phone.
export function usePickPhoto(): PickPhoto {
  return useContext(PhotoPickerContext);
}

export function PhotoPickerProvider({ children }: PropsWithChildren) {
  if (onFrame || onEchoShow) {
    return <PhonePhotoPicker>{children}</PhonePhotoPicker>;
  }
  return children;
}

// Photos sent from a parent's phone through the API, for
// devices that can't pick one themselves: usePickPhoto() inside it shows a QR
// code and waits for the photo, a data URI. Web only (the QR code is an SVG).
// Used on the Frameo frame, which has no camera or photos of its own, and the
// Echo Show, whose web view can't pick or take a photo.
export function PhonePhotoPicker({ children }: PropsWithChildren) {
  return <SheetPhotoPicker sheet={PhonePhotoSheet}>{children}</SheetPhotoPicker>;
}

// Cropped square, like the tiles that show it (they cover-crop). Saving scales
// it down (src/photos/shrink.ts).
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
};

async function pickFromLibrary(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow access to your photos to pick a picture.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  return result.canceled ? null : result.assets[0].uri;
}

// Takes a photo with the camera, on phones only (the frame and the Echo Show
// have a phone send one instead). Resolves with the photo's URI, or null
// when the grown-up backs out or says no to the camera.
export async function takePhoto(): Promise<string | null> {
  // Browsers only open the camera from inside the tap itself, so on web the
  // permission request (a no-op there) must not come first.
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to your camera to take a photo.');
      return null;
    }
  }

  const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
  return result.canceled ? null : result.assets[0].uri;
}

type PhotoSourceButtonsProps = {
  // Called with the photo the grown-up took or picked.
  onPhoto: (uri: string) => void;
  // Shown as chosen when the thing being edited already has a photo.
  selected?: boolean;
};

// The ways to get a photo: take one with the camera or pick one from the
// gallery on phones, or send one from a phone on the frame and the Echo Show.
export function PhotoSourceButtons({ onPhoto, selected = false }: PhotoSourceButtonsProps) {
  const pickPhoto = usePickPhoto();

  async function choose(source: PickPhoto) {
    const uri = await source();
    if (uri) onPhoto(uri);
  }

  if (onFrame || onEchoShow) {
    return (
      <Pressable
        style={[styles.source, selected && styles.sourceSelected]}
        onPress={() => choose(pickPhoto)}
        accessibilityRole="button"
      >
        <Text style={styles.sourceText}>📱 Send a photo from your phone</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.sources}>
      <Pressable
        style={[styles.source, styles.sourceHalf, selected && styles.sourceSelected]}
        onPress={() => choose(takePhoto)}
        accessibilityRole="button"
      >
        <Text style={styles.sourceText}>📸 Take a photo</Text>
      </Pressable>
      <Pressable
        style={[styles.source, styles.sourceHalf, selected && styles.sourceSelected]}
        onPress={() => choose(pickPhoto)}
        accessibilityRole="button"
      >
        <Text style={styles.sourceText}>🖼️ From your gallery</Text>
      </Pressable>
    </View>
  );
}

// A sheet that picks a photo, shown over the screen while usePickPhoto() waits.
type PhotoSheet = ComponentType<{ onDone: (uri: string | null) => void }>;

function SheetPhotoPicker({ sheet: Sheet, children }: PropsWithChildren<{ sheet: PhotoSheet }>) {
  const [request, setRequest] = useState<{ resolve: (uri: string | null) => void } | null>(null);

  const pick = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        setRequest((previous) => {
          previous?.resolve(null);
          return { resolve };
        });
      }),
    [],
  );

  const finish = useCallback(
    (uri: string | null) => {
      request?.resolve(uri);
      setRequest(null);
    },
    [request],
  );

  // Photos are only picked on grown-up screens, so locking closes the picker
  // along with them.
  const { unlocked } = useParentLock();
  const [wasUnlocked, setWasUnlocked] = useState(unlocked);
  if (unlocked !== wasUnlocked) {
    setWasUnlocked(unlocked);
    if (!unlocked) setRequest(null);
  }

  return (
    <PhotoPickerContext.Provider value={pick}>
      {children}
      <Modal
        visible={request != null}
        transparent
        animationType="fade"
        onRequestClose={() => finish(null)}
      >
        {request ? <Sheet onDone={finish} /> : null}
      </Modal>
    </PhotoPickerContext.Provider>
  );
}

const styles = StyleSheet.create({
  sources: { flexDirection: 'row', gap: spacing.sm },
  source: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  sourceHalf: { flex: 1 },
  sourceSelected: { borderColor: colors.primary, backgroundColor: colors.border },
  sourceText: {
    ...typography.body,
    color: colors.text,
    fontFamily: fonts.semibold,
    textAlign: 'center',
  },
});
