import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '../theme';

// The parts of the stack's header props this header reads.
type LargeHeaderProps = {
  navigation: { goBack: () => void };
  options: { title?: string };
  back?: { title?: string | undefined } | undefined;
};

// The header for stack screens on large screens: the platform header's back
// arrow is a small target on a 10" frame, so this one has a big Back pill.
export function LargeHeader({ navigation, options, back }: LargeHeaderProps) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <View style={styles.bar}>
        {back ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {options.title}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, borderBottomWidth: 2, borderBottomColor: colors.border },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 96,
    paddingHorizontal: spacing.lg,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.border,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  backArrow: { fontSize: 40, lineHeight: 44, fontWeight: '800', color: colors.primary, marginTop: -4 },
  backText: { fontSize: 22, fontWeight: '800', color: colors.text },
  title: { ...typography.title, color: colors.text, flex: 1 },
});
