import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, useLargeScreen } from '../theme';
import { useParentLock } from './ParentLockProvider';

// The way into settings. A tap asks for the PIN, which keeps the kids out.
export function ParentLockButton() {
  const { openParentScreen } = useParentLock();
  const large = useLargeScreen();

  return (
    <Pressable
      onPress={() => openParentScreen('/settings')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Grown-up settings"
      accessibilityHint="Asks for the PIN"
    >
      {({ pressed }) => (
        <View style={[styles.button, large && styles.buttonLarge, pressed && styles.pressed]}>
          <Text style={[styles.icon, large && styles.iconLarge]}>🔒</Text>
        </View>
      )}
    </Pressable>
  );
}

const SIZE = 36;
const SIZE_LARGE = 60;

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLarge: { width: SIZE_LARGE, height: SIZE_LARGE, borderRadius: SIZE_LARGE / 2 },
  pressed: { backgroundColor: colors.border, transform: [{ scale: 0.92 }] },
  icon: { fontSize: 16, opacity: 0.6 },
  iconLarge: { fontSize: 30 },
});
