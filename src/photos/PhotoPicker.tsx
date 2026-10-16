import * as ImagePicker from 'expo-image-picker';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '../theme';
import { frameoPhotos, frameoPhotoUri, listFrameoPhotos, type FrameoPhotos } from './frameo';

// Resolves with the picked photo's URI, or null when the grown-up backs out.
type PickPhoto = () => Promise<string | null>;

const PhotoPickerContext = createContext<PickPhoto>(pickFromLibrary);

// How a kid's or an icon's photo is chosen: from the device's photo library,
// or in a Frameo frame build, from the photos sent to the frame with the Frameo
// phone app.
export function usePickPhoto(): PickPhoto {
  return useContext(PhotoPickerContext);
}

export function PhotoPickerProvider({ children }: PropsWithChildren) {
  return frameoPhotos ? <FrameoPhotoPicker>{children}</FrameoPhotoPicker> : children;
}

async function pickFromLibrary(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow access to your photos to pick a picture.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  return result.canceled ? null : result.assets[0].uri;
}

// What's kept for a kid or an icon: sharp enough for the biggest badge, and
// small enough as a data URI in the frame's database.
const PHOTO_SIZE = 512;
const THUMB_SIZE = 150;
const REFRESH_MS = 4000;

function FrameoPhotoPicker({ children }: PropsWithChildren) {
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

  return (
    <PhotoPickerContext.Provider value={pick}>
      {children}
      <Modal
        visible={request != null}
        transparent
        animationType="fade"
        onRequestClose={() => finish(null)}
      >
        {request ? <FrameoPhotoSheet onDone={finish} /> : null}
      </Modal>
    </PhotoPickerContext.Provider>
  );
}

function FrameoPhotoSheet({ onDone }: { onDone: (uri: string | null) => void }) {
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
  cancel: { ...typography.body, color: colors.textMuted, fontWeight: '600' },
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
  buttonText: { ...typography.body, color: colors.surface, fontWeight: '700' },
});
