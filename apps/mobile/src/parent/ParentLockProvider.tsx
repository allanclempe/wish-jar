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

import { getParentPin, PIN_LENGTH, setParentPin, useFamilyJar, useJarVersion } from '../db';
import { colors, fonts, primaryShadow, radius, spacing, typography } from '../theme';
import { PinPad } from './PinPad';

// What the PIN prompt says. Without one it reads "Grown-ups only". While no
// PIN is set it asks a grown-up to confirm instead, with `noPinSubtitle` and a
// `confirm` button.
export type PinPromptText = {
  emoji?: string;
  title?: string;
  subtitle?: string;
  noPinSubtitle?: string;
  confirm?: string;
};

type ParentLockContextValue = {
  // True while a grown-up has entered the PIN and not yet gone back to the kids' tabs.
  unlocked: boolean;
  // Asks for the PIN without unlocking, for a single grown-up action.
  requestPin: (text?: PinPromptText) => Promise<boolean>;
  // Asks for the PIN unless already unlocked, then opens a grown-up screen.
  // While no PIN is set it opens straight away.
  openParentScreen: (href: Href) => Promise<void>;
  // False while no grown-up has set a PIN (WJ-71).
  pinSet: boolean;
  // Sets the family's PIN.
  savePin: (pin: string) => Promise<void>;
};

const ParentLockContext = createContext<ParentLockContextValue | null>(null);

export function ParentLockProvider({ children }: PropsWithChildren) {
  const jar = useFamilyJar();
  const pinVersion = useJarVersion('app_settings');
  // The family's PIN, null while none is set, undefined until it's read.
  const [pin, setPin] = useState<string | null | undefined>(undefined);
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

  const readPin = useCallback(
    () =>
      getParentPin(jar).then(
        (value) => {
          setPin(value);
          return value;
        },
        () => undefined,
      ),
    [jar],
  );

  // `pinVersion` reads it again when another device sets it.
  useEffect(() => {
    readPin();
  }, [readPin, pinVersion]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') setUnlocked(false);
    });
    return () => subscription.remove();
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
      const current = pin === undefined ? await readPin() : pin;
      if (current !== null && !(await requestPin())) return;
      pendingHref.current = href;
      setUnlocked(true);
    },
    [unlocked, pin, readPin, requestPin],
  );

  const savePin = useCallback(
    async (next: string) => {
      await setParentPin(jar, next);
      setPin(next);
    },
    [jar],
  );

  const finish = useCallback(
    (ok: boolean) => {
      prompt?.resolve(ok);
      setPrompt(null);
    },
    [prompt],
  );

  const value = useMemo<ParentLockContextValue>(
    () => ({ unlocked, requestPin, openParentScreen, pinSet: pin !== null, savePin }),
    [unlocked, requestPin, openParentScreen, pin, savePin],
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
        {prompt ? <PinPrompt text={prompt.text} pinSet={pin !== null} onDone={finish} /> : null}
      </Modal>
    </ParentLockContext.Provider>
  );
}

// How long the prompt stays up, showing the PIN was right, before it closes.
// On a slow frame a grown-up taps the last digit again before the screen
// catches up; while the prompt is up those taps land on it, not on whatever
// opens under that spot (Change PIN, in settings).
const ACCEPTED_MS = 700;

type PinPromptProps = {
  text?: PinPromptText;
  // Shows the PIN pad; without a PIN, a button to confirm. A PIN not read yet
  // counts as set.
  pinSet: boolean;
  onDone: (ok: boolean) => void;
};

function PinPrompt({ text, pinSet, onDone }: PinPromptProps) {
  const jar = useFamilyJar();
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(0);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!accepted) return;
    const timer = setTimeout(() => onDone(true), ACCEPTED_MS);
    return () => clearTimeout(timer);
  }, [accepted, onDone]);

  async function change(next: string) {
    if (accepted) return;
    setValue(next);
    if (next.length < PIN_LENGTH) return;
    // A PIN that can't be read (the jar's reconnecting screen says why) lets
    // nobody in.
    if (next === (await getParentPin(jar).catch(() => null))) {
      setAccepted(true);
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
        {pinSet ? (
          <>
            <Text style={styles.subtitle}>{text?.subtitle ?? 'Enter the PIN to carry on.'}</Text>
            <PinPad value={value} onChange={change} shake={shake} accepted={accepted} />
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>{text?.noPinSubtitle ?? 'Grown-up: tap to carry on.'}</Text>
            <Pressable style={styles.confirm} onPress={() => onDone(true)} accessibilityRole="button">
              <Text style={styles.confirmText}>{text?.confirm ?? 'Carry on'}</Text>
            </Pressable>
          </>
        )}
        <Pressable
          onPress={() => onDone(false)}
          disabled={accepted}
          accessibilityRole="button"
          hitSlop={12}
        >
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
  confirm: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignSelf: 'stretch',
    alignItems: 'center',
    ...primaryShadow,
  },
  confirmText: { ...typography.heading, color: colors.surface },
  cancel: { ...typography.body, color: colors.textMuted, fontFamily: fonts.semibold, marginTop: spacing.sm },
});
