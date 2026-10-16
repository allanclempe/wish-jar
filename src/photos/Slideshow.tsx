import { useEffect, useState } from 'react';
import {
  AppState,
  Image,
  Modal,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { IconBadge } from '../components/Icons';
import { ProgressBar } from '../components/ProgressBar';
import { getKidSavings, listWishes, useDatabase, type Kid } from '../db';
import { useActiveKid } from '../kids/ActiveKidProvider';
import { colors, radius, spacing, typography } from '../theme';
import { orderWishes, type WishProgress } from '../wishes/order';
import { frameoSlideUri, listFrameoPhotos, type FrameoPhoto } from './frameo';

// How long nobody has to touch the frame before the slideshow starts.
const IDLE_MS = 3 * 60 * 1000;
const SLIDE_MS = 15 * 1000;
// Run by the browser as a CSS transition rather than stepped from JavaScript,
// which the frame's slow chip can't keep smooth.
const FADE_MS = 1500;
// Anything that counts as someone using Wish Jar.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const;

// On the frame (frameoPhotos), shows the photos sent to it with Frameo once
// nobody has used Wish Jar for a while, with each kid's coins and closest wish
// along the bottom. A tap goes back to whatever screen was open. Without
// photos, or without permission to read them, Wish Jar just stays as it is.
export function IdleSlideshow() {
  const [photos, setPhotos] = useState<FrameoPhoto[] | null>(null);

  useEffect(() => {
    if (photos) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bumped by every touch, so a touch while the photos load still counts.
    let generation = 0;

    function arm() {
      generation += 1;
      clearTimeout(timer);
      timer = setTimeout(start, IDLE_MS);
    }

    async function start() {
      // Not while Frameo is in front (Connect a phone): Wish Jar comes back where it left off.
      if (AppState.currentState !== 'active') return arm();
      const started = generation;
      let listed;
      try {
        listed = await listFrameoPhotos(false);
      } catch {
        listed = null;
      }
      if (cancelled || started !== generation) return;
      if (listed?.status === 'ok' && listed.photos.length > 0) setPhotos(listed.photos);
      else arm();
    }

    arm();
    for (const event of ACTIVITY_EVENTS) document.addEventListener(event, arm, true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, arm, true);
    };
  }, [photos]);

  return (
    <Modal visible={photos != null} animationType="fade" onRequestClose={() => setPhotos(null)}>
      {photos ? <Slides photos={photos} onClose={() => setPhotos(null)} /> : null}
    </Modal>
  );
}

type SlideState = {
  photos: FrameoPhoto[];
  index: number;
  // Counts every slide shown, so the same photo twice in a row still fades in.
  step: number;
  previous: string | null;
  // The photo has loaded, so it can fade in.
  loaded: boolean;
};

function Slides({ photos, onClose }: { photos: FrameoPhoto[]; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const ratio = PixelRatio.get();
  const [slide, setSlide] = useState<SlideState>(() => ({
    photos,
    index: 0,
    step: 0,
    previous: null,
    loaded: false,
  }));
  const uri = frameoSlideUri(slide.photos[slide.index], width * ratio, height * ratio);

  // Newest first, and the list is read again at the end of each round, so a
  // photo sent in the meantime joins the next one.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      let next = slide.photos;
      let index = slide.index + 1;
      if (index >= next.length) {
        index = 0;
        try {
          const listed = await listFrameoPhotos(false);
          if (listed.status === 'ok' && listed.photos.length > 0) next = listed.photos;
        } catch {
          // Keep going round the photos already listed.
        }
      }
      if (cancelled) return;
      setSlide({ photos: next, index, step: slide.step + 1, previous: uri, loaded: false });
    }, SLIDE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slide, uri]);

  function fadeIn() {
    const step = slide.step;
    setSlide((current) => (current.step === step ? { ...current, loaded: true } : current));
  }

  return (
    <Pressable
      style={styles.screen}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="Back to Wish Jar"
    >
      {slide.previous ? (
        <Image source={{ uri: slide.previous }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      ) : null}
      <View key={slide.step} style={[styles.slide, fade, { opacity: slide.loaded ? 1 : 0 }]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" onLoad={fadeIn} />
      </View>
      <KidsStrip />
    </Pressable>
  );
}

type KidProgress = {
  kid: Kid;
  coins: number;
  // The unclaimed wish with the fewest coins to go, if the kid has one.
  wish: WishProgress | null;
};

// Read once as the slideshow opens: nobody earns coins while it's showing.
function KidsStrip() {
  const db = useDatabase();
  const { kids } = useActiveKid();
  const [progress, setProgress] = useState<KidProgress[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listWishes(db), Promise.all(kids.map((kid) => getKidSavings(db, kid.id)))]).then(
      ([wishes, savings]) => {
        if (cancelled) return;
        setProgress(
          kids.map((kid, i) => {
            const kidWishes = wishes.filter((wish) => wish.kidId === kid.id);
            const closest = orderWishes(kidWishes, savings[i]).find(({ state }) => state !== 'claimed');
            return { kid, coins: savings[i], wish: closest ?? null };
          }),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, kids]);

  if (progress.length === 0) return null;

  return (
    <View style={styles.strip} pointerEvents="none">
      {progress.map(({ kid, coins, wish }) => (
        <View key={kid.id} style={styles.kid}>
          <IconBadge icon={{ emoji: null, photoUri: kid.photoUri }} fallbackEmoji="🙂" size={56} />
          <View style={styles.kidText}>
            <View style={styles.kidHeader}>
              <Text style={styles.name} numberOfLines={1}>
                {kid.name}
              </Text>
              <View style={styles.coins}>
                <Text style={styles.coinsText}>🪙 {coins}</Text>
              </View>
            </View>
            {wish ? (
              <>
                <ProgressBar progress={wish.progress} />
                <Text style={styles.wish} numberOfLines={1}>
                  {wish.state === 'unlocked'
                    ? `${wish.wish.name}: ready! 🎉`
                    : `${wish.wish.name}: 🪙 ${wish.coinsStillNeeded} to go`}
                </Text>
              </>
            ) : (
              <Text style={styles.wish}>No wishes yet</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

// React Native Web passes these through to CSS; they aren't in React Native's style types.
const fade = {
  transitionProperty: 'opacity',
  transitionDuration: `${FADE_MS}ms`,
  transitionTimingFunction: 'ease-in-out',
  willChange: 'opacity',
} as object;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  // Opaque, so a narrower photo's bars hide the one before instead of showing it around the edges.
  slide: { ...StyleSheet.absoluteFill, backgroundColor: '#000000' },
  strip: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  kid: {
    flex: 1,
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: radius.lg,
    padding: spacing.md,
    // The rim and shadow keep the card apart from a white photo behind it.
    borderWidth: 3,
    borderColor: colors.primary,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  kidText: { flex: 1, gap: spacing.xs },
  kidHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.body, flexShrink: 1, fontWeight: '800', color: colors.text },
  // Same white pill with a yellow rim as the coin counter at the top of the app.
  coins: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.sunshine,
    paddingHorizontal: spacing.sm,
  },
  coinsText: { ...typography.body, fontWeight: '900', color: colors.text },
  wish: { ...typography.caption, fontWeight: '700', color: colors.textMuted },
});
