import * as ImagePicker from 'expo-image-picker';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { onEchoShow } from '../device/host';
import { useParentLock } from '../parent/ParentLockProvider';
import { colors, fonts, radius, spacing, typography } from '../theme';
import {
  connectPhone,
  frameoPhotos,
  frameoPhotoUri,
  listFrameoPhotos,
  type FrameoPhotos,
} from './frameo';
import { PhonePhotoSheet } from './PhonePhotoSheet';

// Resolves with the picked photo's URI, or null when the grown-up backs out.
export type PickPhoto = () => Promise<string | null>;

const PhotoPickerContext = createContext<PickPhoto>(pickFromLibrary);

// How a kid's or an icon's photo is chosen: from the device's photo library;
// in a Frameo frame build, from the photos sent to the frame with the Frameo
// phone app; or on the Echo Show, sent from a parent's phone.
export function usePickPhoto(): PickPhoto {
  return useContext(PhotoPickerContext);
}

export function PhotoPickerProvider({ children }: PropsWithChildren) {
  if (frameoPhotos) {
    return <SheetPhotoPicker sheet={FrameoPhotoSheet}>{children}</SheetPhotoPicker>;
  }
  if (onEchoShow) {
    return <PhonePhotoPicker>{children}</PhonePhotoPicker>;
  }
  return children;
}

// Photos sent from a parent's phone through the photo relay (relay/), for
// devices that can't pick one themselves: usePickPhoto() inside it shows a QR
// code and waits for the photo, a data URI. Web only (the QR code is an SVG).
// Used on the Echo Show, whose web view can't pick or take a photo.
export function PhonePhotoPicker({ children }: PropsWithChildren) {
  return <SheetPhotoPicker sheet={PhonePhotoSheet}>{children}</SheetPhotoPicker>;
}

// Cropped square, like the tiles that show it (they cover-crop); the frame app
// crops Frameo photos square too. Saving scales it down (src/photos/shrink.ts).
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

// Takes a photo with the camera, on phones only (the frame has no camera, and
// picks from Frameo's photos instead). Resolves with the photo's URI, or null
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
// gallery on phones, pick one sent with Frameo on the frame, or send one from a
// phone on the Echo Show.
export function PhotoSourceButtons({ onPhoto, selected = false }: PhotoSourceButtonsProps) {
  const pickPhoto = usePickPhoto();

  async function choose(source: PickPhoto) {
    const uri = await source();
    if (uri) onPhoto(uri);
  }

  if (frameoPhotos || onEchoShow) {
    return (
      <Pressable
        style={[styles.source, selected && styles.sourceSelected]}
        onPress={() => choose(pickPhoto)}
        accessibilityRole="button"
      >
        <Text style={styles.sourceText}>
          {frameoPhotos ? '📷 Pick a photo sent with Frameo' : '📱 Send a photo from your phone'}
        </Text>
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

// What's kept for a kid or an icon: sharp enough for the biggest badge, and
// quick to upload to the family jar from the frame.
const PHOTO_SIZE = 512;
const THUMB_SIZE = 150;
const REFRESH_MS = 4000;
// Back from Connect a phone sooner than this, the grown-up is still unlocked and
// lands back in the picker. The frame app's 5-minute fallback return locks.
const CONNECT_UNLOCKED_MS = 4 * 60_000;

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

  // Photos are only picked on grown-up screens, so locking (say, coming back
  // from Frameo's Connect a phone after too long) closes the picker along with
  // them.
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

function FrameoPhotoSheet({ onDone }: { onDone: (uri: string | null) => void }) {
  const { keepUnlockedWhileAway } = useParentLock();
  const [photos, setPhotos] = useState<FrameoPhotos | 'loading' | 'error'>('loading');
  // Bumped by "Ask again", which asks the frame for permission once more.
  const [askCount, setAskCount] = useState(0);

  // Refreshes while open, so a photo sent from a phone right now pops in by itself.
  useEffect(() => {
    let cancelled = false;
    let ask = true;
    async function refresh() {
      let next: FrameoPhotos | 'error';
      try {
        next = await listFrameoPhotos(ask);
      } catch {
        next = 'error';
      }
      ask = false;
      if (cancelled) return;
      setPhotos((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    }
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [askCount]);

  let content;
  if (photos === 'loading') {
    content = <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />;
  } else if (photos === 'error') {
    content = <Message emoji="😕" text="Couldn't load Frameo's photos. Trying again…" />;
  } else if (photos.status === 'permission') {
    content = (
      <Message
        emoji="🔓"
        text="Wish Jar needs your OK to see Frameo's photos. Tap Allow on the frame."
        hint="Nothing popped up? Hold two fingers on the screen, open Android settings, then Apps → Wish Jar → Permissions, and turn on Storage."
      >
        <Pressable
          style={styles.button}
          onPress={() => setAskCount((count) => count + 1)}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Ask again</Text>
        </Pressable>
      </Message>
    );
  } else if (photos.photos.length === 0) {
    content = <Message emoji="📮" text="No photos on this frame yet." />;
  } else {
    content = (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
        {photos.photos.map((photo) => (
          <Pressable
            key={photo.name}
            onPress={() => onDone(frameoPhotoUri(photo, PHOTO_SIZE))}
            accessibilityRole="button"
            accessibilityLabel="Use this photo"
          >
            <Image
              source={{ uri: frameoPhotoUri(photo, THUMB_SIZE * PixelRatio.get()) }}
              style={styles.thumb}
            />
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>📷 Photos sent with Frameo</Text>
            <Text style={styles.subtitle}>
              Send a photo to this frame with the Frameo app on your phone, and it shows up here.
            </Text>
          </View>
          <Pressable onPress={() => onDone(null)} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
        {content}
        <View style={styles.connect}>
          <Text style={styles.connectText}>
            New phone? Connect it in Frameo: choose Add friend, then type the code into the Frameo
            app on the phone. Wish Jar comes back when its first photo arrives.
          </Text>
          <Pressable
            style={[styles.button, styles.connectButton]}
            onPress={() => {
              keepUnlockedWhileAway(CONNECT_UNLOCKED_MS);
              connectPhone();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>📱 Connect a phone</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Message({
  emoji,
  text,
  hint,
  children,
}: PropsWithChildren<{ emoji: string; text: string; hint?: string }>) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageEmoji}>{emoji}</Text>
      <Text style={styles.messageText}>{text}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(61, 44, 46, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 1040,
    maxHeight: '100%',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerText: { flex: 1, gap: spacing.xs },
  title: { ...typography.heading, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted },
  cancel: { ...typography.body, color: colors.textMuted, fontFamily: fonts.semibold },
  loading: { padding: spacing.xl },
  scroll: { flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  message: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  messageEmoji: { fontSize: 44 },
  messageText: { ...typography.body, color: colors.text, textAlign: 'center' },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', maxWidth: 520 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  buttonText: { ...typography.body, color: colors.surface, fontFamily: fonts.bold },
  connect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  connectText: { ...typography.caption, color: colors.textMuted, flex: 1 },
  connectButton: { marginTop: 0 },
});
