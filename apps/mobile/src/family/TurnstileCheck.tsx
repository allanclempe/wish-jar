import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { API_URL } from '../apiUrl';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { TURNSTILE_SITE_KEY } from './turnstile';

type Props = {
  // The widget's token, once the check has passed. It works once, for 5
  // minutes.
  onToken: (token: string) => void;
};

// The Turnstile check before starting a family (WJ-54). Turnstile only runs in
// a browser, so the phone app shows the API's page with the widget
// (apps/api/src/turnstile.ts), which sends the token back through
// window.ReactNativeWebView.
export function TurnstileCheck({ onToken }: Props) {
  // A new WebView for each try after the page didn't load.
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  function heard(event: WebViewMessageEvent) {
    try {
      const { token } = JSON.parse(event.nativeEvent.data) as { token?: unknown };
      if (typeof token === 'string') onToken(token);
    } catch {
      // Not from the page.
    }
  }

  if (failed) {
    return (
      <View style={styles.box}>
        <Text style={styles.note}>The check couldn&apos;t load. Check the Wi-Fi, then try again.</Text>
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
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <WebView
        key={attempt}
        style={styles.web}
        source={{ uri: `${API_URL}/turnstile?sitekey=${encodeURIComponent(TURNSTILE_SITE_KEY)}` }}
        onMessage={heard}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // The widget is 300 by 65; the page puts a "Try again" under it when it fails.
  box: { alignSelf: 'stretch', height: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  web: { width: 340, flex: 1, backgroundColor: colors.background },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  note: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
  },
  buttonText: { ...typography.body, color: colors.surface, fontFamily: fonts.bold },
});
