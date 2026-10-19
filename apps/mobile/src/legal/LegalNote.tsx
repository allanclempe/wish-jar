import * as Linking from 'expo-linking';
import { StyleSheet, Text, type TextStyle, type StyleProp } from 'react-native';

import { onEchoShow, onFrame } from '../device/host';
import { colors, typography } from '../theme';

// The site's terms of use and privacy policy (WJ-75), served with the app.
export const TERMS_URL = 'https://wish-jar.blastin.dev/terms.html';
export const PRIVACY_URL = 'https://wish-jar.blastin.dev/privacy.html';

// The Echo Show and the frame are kiosks: a page opened there has no way back
// to Wish Jar, so they show the addresses to type on a phone instead.
export const canOpenLinks = !onEchoShow && !onFrame;

export function openLegalPage(url: string): void {
  Linking.openURL(url).catch(() => {});
}

// "By starting or joining a jar you agree to…", under the setup screen's
// choices (WJ-78).
export function LegalNote({ style }: { style?: StyleProp<TextStyle> }) {
  if (!canOpenLinks) {
    return (
      <Text style={[styles.note, style]}>
        By starting or joining a jar you agree to Wish Jar&apos;s terms of use and privacy policy,
        at wish-jar.blastin.dev/terms.html and wish-jar.blastin.dev/privacy.html.
      </Text>
    );
  }
  return (
    <Text style={[styles.note, style]}>
      By starting or joining a jar you agree to the{' '}
      <Text style={styles.link} onPress={() => openLegalPage(TERMS_URL)} accessibilityRole="link">
        Terms of Use
      </Text>{' '}
      and{' '}
      <Text style={styles.link} onPress={() => openLegalPage(PRIVACY_URL)} accessibilityRole="link">
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  link: { color: colors.primaryDark, textDecorationLine: 'underline' },
});
