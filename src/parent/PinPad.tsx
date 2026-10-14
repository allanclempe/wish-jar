import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useNativeDriver } from '../components/Animations';
import { PIN_LENGTH } from '../db';
import { colors, radius, spacing, typography } from '../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

type PinPadProps = {
  value: string;
  onChange: (value: string) => void;
  // Each new value shakes the dots, to say the PIN was wrong.
  shake?: number;
};

export function PinPad({ value, onChange, shake = 0 }: PinPadProps) {
  const [offset] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (shake === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    const step = (toValue: number) =>
      Animated.timing(offset, { toValue, duration: 50, useNativeDriver });
    Animated.sequence([step(12), step(-12), step(10), step(-10), step(6), step(0)]).start();
  }, [shake, offset]);

  function press(key: string) {
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= PIN_LENGTH) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(value + key);
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.dots, { transform: [{ translateX: offset }] }]}
        accessibilityLabel={`${value.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
        ))}
      </Animated.View>

      <View style={styles.keys}>
        {KEYS.map((key, i) =>
          key === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              style={({ pressed }) => [styles.key, styles.keyButton, pressed && styles.keyPressed]}
              onPress={() => press(key)}
              accessibilityRole="button"
              accessibilityLabel={key === '⌫' ? 'Delete' : key}
            >
              <Text style={styles.keyText}>{key}</Text>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const KEY_SIZE = 72;
const DOT_SIZE = 22;

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.lg },
  dots: { flexDirection: 'row', gap: spacing.md },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  dotFilled: { backgroundColor: colors.primary },
  keys: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: KEY_SIZE * 3 + spacing.md * 2,
    gap: spacing.md,
  },
  key: { width: KEY_SIZE, height: KEY_SIZE, alignItems: 'center', justifyContent: 'center' },
  keyButton: {
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
  },
  keyPressed: { backgroundColor: colors.border, transform: [{ scale: 0.94 }] },
  keyText: { ...typography.title, color: colors.text },
});
