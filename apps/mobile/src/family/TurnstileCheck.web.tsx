import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing, typography } from '../theme';
import { TURNSTILE_SITE_KEY } from './turnstile';

type Props = {
  // The widget's token, once the check has passed. It works once, for 5
  // minutes.
  onToken: (token: string) => void;
};

// The parts of Cloudflare's turnstile global used here.
type Turnstile = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: 'light';
      callback: (token: string) => void;
      'error-callback': () => boolean;
    },
  ): string | undefined;
  remove(widgetId: string): void;
};

const LOADED = 'wishJarTurnstileLoaded';
// Cloudflare asks that the script come from this address as it is.
const SCRIPT = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${LOADED}`;

let loading: Promise<Turnstile> | null = null;

// Cloudflare's script, added to the page the first time a check is shown. A
// script that didn't load is tried again next time.
function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const page = window as unknown as Record<string, unknown>;
    page[LOADED] = () => resolve(page.turnstile as Turnstile);
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new Error('Turnstile did not load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

// The Turnstile check before starting a family (WJ-54), rendered right on the
// page: the site, the frame's pages and the Echo Show's are all web pages.
// Cloudflare's widget works on Wish Jar's cross-origin isolated pages
// (credentialless, app.json).
export function TurnstileCheck({ onToken }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const latestOnToken = useRef(onToken);
  useEffect(() => {
    latestOnToken.current = onToken;
  }, [onToken]);
  // A new widget for each try after one failed.
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    let turnstile: Turnstile | null = null;
    let widgetId: string | undefined;
    loadTurnstile().then(
      (loaded) => {
        if (gone || !box.current) return;
        turnstile = loaded;
        widgetId = loaded.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          callback: (token) => latestOnToken.current(token),
          // Handled here, with a button to run the check again.
          'error-callback': () => {
            setFailed(true);
            return true;
          },
        });
      },
      () => {
        if (!gone) setFailed(true);
      },
    );
    return () => {
      gone = true;
      if (turnstile && widgetId !== undefined) turnstile.remove(widgetId);
    };
  }, [attempt]);

  return (
    <View style={styles.box}>
      <div ref={box} />
      {failed ? (
        <>
          <Text style={styles.note}>The check didn&apos;t work. Check the Wi-Fi, then try again.</Text>
          <Pressable
            style={styles.button}
            onPress={() => {
              setFailed(false);
              setAttempt((count) => count + 1);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The widget is 300 by 65.
  box: { alignSelf: 'stretch', minHeight: 65, alignItems: 'center', gap: spacing.sm },
  note: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
  },
  buttonText: { ...typography.body, color: colors.surface, fontFamily: fonts.bold },
});
