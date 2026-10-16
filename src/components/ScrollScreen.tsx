import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, contentMaxWidth, spacing, useLargeScreen } from '../theme';

type Props = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

// A screen whose content scrolls when it is taller than the screen or the
// keyboard covers it. The header already handles the top inset.
export function ScrollScreen({ children, contentContainerStyle }: Props) {
  const large = useLargeScreen();
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        // flexGrow, not flex: flex pins the content to the screen's height,
        // so it never overflows and the screen can't scroll.
        contentContainerStyle={[styles.content, large && styles.contentLarge, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        // Not on web: React Native Web dismisses on every scroll, including the
        // browser scrolling the focused input above the keyboard, which closes it.
        keyboardDismissMode={Platform.select({ ios: 'interactive', android: 'on-drag', default: 'none' })}
        // iOS only: keeps the focused input above the keyboard, sheets included.
        // Android resizes the window for the keyboard on its own.
        automaticallyAdjustKeyboardInsets
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md, alignItems: 'stretch' },
  // A form stretched across a 1280-wide frame is hard to read; keep it a column.
  contentLarge: { width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingVertical: spacing.xl },
});
