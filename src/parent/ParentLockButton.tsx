import type { Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, useLargeScreen } from '../theme';
import { useParentLock } from './ParentLockProvider';

type ParentButtonProps = {
  icon: string;
  href: Href;
  label: string;
  // Gold rim and full-strength icon, for a button meant to be noticed.
  bright?: boolean;
};

// A round button in the kids' bar that opens a grown-up screen. A tap asks for
// the PIN, which keeps the kids out.
function ParentButton({ icon, href, label, bright = false }: ParentButtonProps) {
  const { openParentScreen } = useParentLock();
  const large = useLargeScreen();

  return (
    <Pressable
      onPress={() => openParentScreen(href)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Asks for the PIN"
    >
      {({ pressed }) => (
        <View
          style={[
            styles.button,
            large && styles.buttonLarge,
            bright && styles.buttonBright,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.icon, large && styles.iconLarge, bright && styles.iconBright]}>
            {icon}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// The way into settings.
export function ParentLockButton() {
  return <ParentButton icon="🔒" href="/settings" label="Grown-up settings" />;
}

// Bonus coins for the kid who is playing, for something special outside the tasks.
export function BonusCoinsButton() {
  return <ParentButton icon="➕" href="/bonus-coins" label="Give bonus coins" bright />;
}

const SIZE = 36;
const SIZE_LARGE = 60;

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.background,
    borderWidth: 3,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLarge: { width: SIZE_LARGE, height: SIZE_LARGE, borderRadius: SIZE_LARGE / 2 },
  buttonBright: { backgroundColor: colors.surface, borderColor: colors.sunshine },
  pressed: { backgroundColor: colors.border, transform: [{ scale: 0.92 }] },
  icon: { fontSize: 16, opacity: 0.6 },
  iconLarge: { fontSize: 30 },
  iconBright: { opacity: 1 },
});
