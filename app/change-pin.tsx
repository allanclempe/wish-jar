import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ScrollScreen } from '../src/components/ScrollScreen';
import { PIN_LENGTH, setParentPin, useDatabase } from '../src/db';
import { PinPad } from '../src/parent/PinPad';
import { colors, spacing, typography } from '../src/theme';

export default function ChangePinScreen() {
  const db = useDatabase();
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(0);
  const [mismatch, setMismatch] = useState(false);

  async function change(next: string) {
    setValue(next);
    if (next.length < PIN_LENGTH) return;
    if (first == null) {
      setFirst(next);
      setValue('');
      setMismatch(false);
      return;
    }
    if (next !== first) {
      setFirst(null);
      setValue('');
      setMismatch(true);
      setShake((count) => count + 1);
      return;
    }
    await setParentPin(db, next);
    router.back();
  }

  return (
    <ScrollScreen contentContainerStyle={styles.container}>
      <Text style={styles.title}>{first == null ? 'Pick a new PIN' : 'Type it once more'}</Text>
      <Text style={styles.subtitle}>
        {mismatch
          ? "Those didn't match. Start again."
          : `${PIN_LENGTH} numbers kids won't guess.`}
      </Text>
      <PinPad value={value} onChange={change} shake={shake} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.heading, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md, textAlign: 'center' },
});
