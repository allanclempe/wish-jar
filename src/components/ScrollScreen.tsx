import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

type Props = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

// A screen whose content scrolls when it is taller than the screen or the
// keyboard covers it. The header already handles the top inset.
export function ScrollScreen({ children, contentContainerStyle }: Props) {
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        // flexGrow, not flex: flex pins the content to the screen's height,
        // so it never overflows and the screen can't scroll.
        contentContainerStyle={[styles.content, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
});
