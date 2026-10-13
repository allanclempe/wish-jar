import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveKid } from './ActiveKidProvider';
import { colors, radius, spacing, typography } from '../theme';

export function KidSwitcher() {
  const { kids, activeKid, savings, selectKid } = useActiveKid();

  if (kids.length === 0) {
    return null;
  }

  const coins = activeKid ? (savings[activeKid.id] ?? 0) : 0;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.bar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          style={styles.scroll}
        >
          {kids.map((kid) => {
            const active = kid.id === activeKid?.id;
            return (
              <Pressable
                key={kid.id}
                style={[styles.kid, active && styles.kidActive]}
                onPress={() => selectKid(kid.id)}
                accessibilityRole="button"
                accessibilityLabel={kid.name}
                accessibilityState={{ selected: active }}
              >
                {kid.photoUri ? (
                  <Image source={{ uri: kid.photoUri }} style={[styles.avatar, active && styles.avatarActive]} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty, active && styles.avatarActive]}>
                    <Text style={styles.avatarEmoji}>🙂</Text>
                  </View>
                )}
                <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                  {kid.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {activeKid ? (
          <View style={styles.coins} accessibilityLabel={`${coins} ${coins === 1 ? 'coin' : 'coins'}`}>
            <Text style={styles.coinsText}>🪙 {coins}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 48;

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.surface, borderBottomWidth: 2, borderBottomColor: colors.border },
  bar: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.md },
  scroll: { flex: 1 },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  coins: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  coinsText: { fontSize: 22, fontWeight: '700', color: colors.primary },
  kid: { alignItems: 'center', gap: spacing.xs, opacity: 0.6 },
  kidActive: { opacity: 1 },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.border,
  },
  avatarActive: { borderColor: colors.primary },
  avatarEmpty: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 24 },
  name: { ...typography.caption, color: colors.textMuted, maxWidth: 72 },
  nameActive: { color: colors.text, fontWeight: '700' },
});
