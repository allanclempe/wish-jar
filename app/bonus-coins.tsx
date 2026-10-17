import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScrollScreen } from '../src/components/ScrollScreen';
import { giveBonusCoins, useDatabase } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { clampBonusCoins, MAX_BONUS_COINS } from '../src/kids/savings';
import { useSound } from '../src/sound/SoundProvider';
import { colors, fonts, offsetShadow, radius, spacing, typography, useLargeScreen } from '../src/theme';

const QUICK_PICKS = [1, 2, 5, 10];

// For something special outside the tasks: the coins go straight into the
// playing kid's savings, and the counter in the kids' bar bounces on the way back.
export default function BonusCoinsScreen() {
  const db = useDatabase();
  const { activeKid, recordSavingsChange } = useActiveKid();
  const { playCoin } = useSound();
  const large = useLargeScreen();
  const [coins, setCoins] = useState(5);
  const [saving, setSaving] = useState(false);

  async function give() {
    if (!activeKid || saving) return;
    setSaving(true);
    try {
      await giveBonusCoins(db, { kidId: activeKid.id, coins });
      recordSavingsChange(activeKid.id, coins);
      playCoin();
      router.back();
    } catch {
      Alert.alert('Could not save', 'Something went wrong while saving. Please try again.');
      setSaving(false);
    }
  }

  if (!activeKid) {
    return (
      <ScrollScreen>
        <Text style={styles.caption}>Pick a kid at the top first.</Text>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Text style={styles.emoji}>🌟</Text>
      <Text style={styles.title}>{activeKid.name} did something special?</Text>
      <Text style={styles.caption}>The coins go straight into their jar.</Text>

      <View style={styles.picks}>
        {QUICK_PICKS.map((pick) => (
          <Pressable
            key={pick}
            onPress={() => setCoins(pick)}
            style={({ pressed }) => [
              styles.pick,
              large && styles.pickLarge,
              pick === coins && styles.pickChosen,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: pick === coins }}
            accessibilityLabel={`${pick} ${pick === 1 ? 'coin' : 'coins'}`}
          >
            <Text style={[styles.pickText, large && styles.pickTextLarge]}>+{pick}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.stepper}>
        <StepButton
          label="−"
          name="One less"
          disabled={coins <= 1}
          onPress={() => setCoins(clampBonusCoins(coins - 1))}
        />
        <Text style={[styles.amount, large && styles.amountLarge]} accessibilityLiveRegion="polite">
          🪙 {coins}
        </Text>
        <StepButton
          label="+"
          name="One more"
          disabled={coins >= MAX_BONUS_COINS}
          onPress={() => setCoins(clampBonusCoins(coins + 1))}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, large && styles.buttonLarge, saving && styles.buttonDisabled, pressed && styles.pressed]}
        onPress={give}
        disabled={saving}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>
          Give {coins} {coins === 1 ? 'coin' : 'coins'}
        </Text>
      </Pressable>
    </ScrollScreen>
  );
}

type StepButtonProps = {
  label: string;
  name: string;
  disabled: boolean;
  onPress: () => void;
};

function StepButton({ label, name, disabled, onPress }: StepButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.step, disabled && styles.buttonDisabled, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={name}
      hitSlop={8}
    >
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

const STEP_SIZE = 64;

const styles = StyleSheet.create({
  emoji: { fontSize: 56, textAlign: 'center' },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  caption: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  picks: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  pick: {
    minWidth: 72,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.border,
    alignItems: 'center',
  },
  pickLarge: { minWidth: 110, paddingVertical: spacing.md },
  pickChosen: { borderColor: colors.sunshine, backgroundColor: '#FFF3C4' },
  pickText: { ...typography.heading, color: colors.text },
  pickTextLarge: { ...typography.title },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  step: {
    width: STEP_SIZE,
    height: STEP_SIZE,
    borderRadius: STEP_SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 34, lineHeight: 40, fontFamily: fonts.display, color: colors.primary },
  amount: { ...typography.hero, color: colors.text, minWidth: 120, textAlign: 'center' },
  amountLarge: { fontSize: 48, lineHeight: 58, minWidth: 180 },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.surface,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...offsetShadow(colors.primaryDark, 6),
  },
  buttonLarge: { paddingVertical: spacing.lg },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.heading, color: colors.surface },
  pressed: { transform: [{ scale: 0.95 }] },
});
