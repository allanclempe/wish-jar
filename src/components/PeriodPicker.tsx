import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PERIODS, type Period } from '../db';
import { colors, radius, spacing, typography } from '../theme';

const PERIOD_LABELS: Record<Period, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

type PeriodPickerProps = {
  value: Period;
  onChange: (period: Period) => void;
};

export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  return (
    <View style={styles.container}>
      {PERIODS.map((period) => {
        const selected = value === period;
        return (
          <Pressable
            key={period}
            style={[styles.option, selected && styles.selected]}
            onPress={() => onChange(period)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.optionText, selected && styles.selectedText]}>
              {PERIOD_LABELS[period]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: spacing.sm + 4,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { ...typography.caption, color: colors.text, fontWeight: '600' },
  selectedText: { color: colors.surface },
});
