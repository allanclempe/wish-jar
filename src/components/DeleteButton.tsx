import { Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

type Props = {
  label: string;
  title: string;
  message: string;
  disabled?: boolean;
  onDelete: () => void;
};

// Alert.alert does nothing on web, so the browser's own confirm stands in.
function confirmDelete(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

// Deleting can't be undone, so it always asks first.
export function DeleteButton({ label, title, message, disabled, onDelete }: Props) {
  return (
    <Pressable
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={() => confirmDelete(title, message, onDelete)}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.accent,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.heading, color: colors.accent },
});
