import { router, useSegments, type Href } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { getParentPin, PIN_LENGTH, useDatabase } from '../db';
import { colors, radius, spacing, typography } from '../theme';
import { PinPad } from './PinPad';

// What the PIN prompt says. Without one it reads "Grown-ups only".
export type PinPromptText = {
  emoji?: string;
  title?: string;
  subtitle?: string;
};

type ParentLockContextValue = {
  // True while a grown-up has entered the PIN and not yet gone back to the kids' tabs.
  unlocked: boolean;
  // Asks for the PIN without unlocking, for a single grown-up action.
  requestPin: (text?: PinPromptText) => Promise<boolean>;
  // Asks for the PIN unless already unlocked, then opens a grown-up screen.
  openParentScreen: (href: Href) => Promise<void>;
  // Keeps the PIN unlocked while the app is away on purpose for a grown-up, as
  // long as it's back within `ms`; a longer absence locks as usual.
  keepUnlockedWhileAway: (ms: number) => void;
};

const ParentLockContext = createContext<ParentLockContextValue | null>(null);

export function ParentLockProvider({ children }: PropsWithChildren) {
  const [unlocked, setUnlocked] = useState(false);
  const pendingHref = useRef<Href | null>(null);
  const [prompt, setPrompt] = useState<{
    text?: PinPromptText;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const segments = useSegments();
  const inTabs = segments[0] === '(tabs)';
  const wasInTabs = useRef(inTabs);

  // Coming back to the kids' tabs locks again, so a grown-up who walks away
  // doesn't leave settings open.
  useEffect(() => {
    if (inTabs && !wasInTabs.current) setUnlocked(false);
    wasInTabs.current = inTabs;
  }, [inTabs]);

  // When a trip away (keepUnlockedWhileAway) must be over by; 0 for none.
  const awayUntil = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && awayUntil.current === 0) setUnlocked(false);
      if (state === 'active' && awayUntil.current !== 0) {
        if (Date.now() > awayUntil.current) setUnlocked(false);
        awayUntil.current = 0;
      }
    });
    return () => subscription.remove();
  }, []);

  const keepUnlockedWhileAway = useCallback((ms: number) => {
    awayUntil.current = Date.now() + ms;
  }, []);

  // Grown-up screens are guarded by `unlocked`, so push only once the
  // navigator has rendered with the guard open.
  useEffect(() => {
    if (!unlocked || pendingHref.current == null) return;
    const href = pendingHref.current;
    pendingHref.current = null;
    router.push(href);
  }, [unlocked]);

  const requestPin = useCallback(
    (text?: PinPromptText) =>
      new Promise<boolean>((resolve) => {
        setPrompt((previous) => {
          previous?.resolve(false);
          return { text, resolve };
        });
      }),
    [],
  );

  const openParentScreen = useCallback(
    async (href: Href) => {
      if (unlocked) {
        router.push(href);
        return;
      }
      if (!(await requestPin())) return;
      pendingHref.current = href;
      setUnlocked(true);
    },
    [unlocked, requestPin],
  );

  const finish = useCallback(
    (ok: boolean) => {
      prompt?.resolve(ok);
      setPrompt(null);
    },
    [prompt],
  );

  const value = useMemo<ParentLockContextValue>(
    () => ({ unlocked, requestPin, openParentScreen, keepUnlockedWhileAway }),
    [unlocked, requestPin, openParentScreen, keepUnlockedWhileAway],
  );

  return (
    <ParentLockContext.Provider value={value}>
      {children}
      <Modal
        visible={prompt != null}
        transparent
        animationType="fade"
        onRequestClose={() => finish(false)}
      >
        {prompt ? <PinPrompt text={prompt.text} onDone={finish} /> : null}
      </Modal>
    </ParentLockContext.Provider>
  );
}

function PinPrompt({ text, onDone }: { text?: PinPromptText; onDone: (ok: boolean) => void }) {
  const db = useDatabase();
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(0);

  async function change(next: string) {
    setValue(next);
    if (next.length < PIN_LENGTH) return;
    if (next === (await getParentPin(db))) {
      onDone(true);
    } else {
      setValue('');
      setShake((count) => count + 1);
    }
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <Text style={styles.emoji}>{text?.emoji ?? '🔒'}</Text>
        <Text style={styles.title}>{text?.title ?? 'Grown-ups only'}</Text>
        <Text style={styles.subtitle}>{text?.subtitle ?? 'Enter the PIN to carry on.'}</Text>
        <PinPad value={value} onChange={change} shake={shake} />
        <Pressable onPress={() => onDone(false)} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function useParentLock(): ParentLockContextValue {
  const context = useContext(ParentLockContext);
  if (!context) {
    throw new Error('useParentLock must be used inside ParentLockProvider');
  }
  return context;
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
    gap: spacing.sm,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  emoji: { fontSize: 44 },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  cancel: { ...typography.body, color: colors.textMuted, fontWeight: '600', marginTop: spacing.sm },
});
