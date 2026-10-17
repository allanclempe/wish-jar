import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ScrollScreen } from '../src/components/ScrollScreen';
import { listDevices, useFamilyJar, useSwitchFamily } from '../src/db';
import { JoinFamilyForm } from '../src/family/JoinFamilyForm';
import { colors, spacing, typography } from '../src/theme';

// Moves this device to another family's jar (WJ-48), for a device that
// started a jar of its own before it was meant to share one. Its current jar
// is left behind, not merged.
export default function JoinFamilyScreen() {
  const jar = useFamilyJar();
  const switchFamily = useSwitchFamily();
  // How many other devices keep the current jar, once known.
  const [others, setOthers] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDevices(jar).then(
      (devices) => {
        if (!cancelled) setOthers(devices.filter((device) => !device.thisDevice).length);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [jar]);

  const warning =
    others === 0
      ? "This device leaves its jar, and no other device has it: its kids, tasks, wishes and coins are gone for good. Nothing comes along to the new family's jar."
      : `This device leaves its jar for good${others ? ` (the ${others === 1 ? 'other device keeps' : `${others} other devices keep`} it)` : ''}. Nothing comes along to the new family's jar.`;

  return (
    <ScrollScreen>
      <Text style={styles.title}>Join another family&apos;s jar</Text>
      <Text style={styles.subtitle}>
        On a device in that family, open Grown-ups → Devices → Add a device, then type the code it
        shows.
      </Text>
      <JoinFamilyForm
        warning={warning}
        buttonLabel="Leave this jar and join"
        // Every screen starts again from the new jar, on the kids' tabs.
        onJoined={switchFamily}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.sm },
});
