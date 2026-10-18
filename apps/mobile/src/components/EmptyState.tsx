import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

type EmptyStateProps = {
  emoji: ReactNode;
  title?: string;
  text: string;
  // Override the colours on a background the defaults do not read on, like
  // the evening sky.
  titleColor?: string;
  textColor?: string;
};

// What a screen or list shows when it has nothing in it: an emoji and a line
// of text, centred in the free space, with no card around them.
export function EmptyState({ emoji, title, text, titleColor, textColor }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {typeof emoji === 'string' ? <Text style={styles.emoji}>{emoji}</Text> : emoji}
      {title ? (
        <Text style={[styles.title, titleColor ? { color: titleColor } : null]}>{title}</Text>
      ) : null}
      <Text style={[styles.text, textColor ? { color: textColor } : null]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Grows to fill the list, but never shrinks below its content on a short screen.
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 64 },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  text: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 480 },
});
