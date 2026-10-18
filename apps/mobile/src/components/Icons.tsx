import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Icon } from '../db';
import { PhotoSourceButtons } from '../photos/PhotoPicker';
import { shownPhoto } from '../photos/photos';
import { colors, radius, spacing } from '../theme';

export const ICON_EMOJIS = [
  '🧹', '🪥', '🛏️', '🧽', '🧺', '🍽️', '📚', '🐶',
  '🌱', '🚲', '🎁', '🧸', '🎮', '🎨', '⚽', '🏊',
  '🍦', '🍕', '🍭', '👟', '📺', '🎈', '🦄', '🚀',
];

// A kid without a photo is a boy or a girl (WJ-74). A new kid starts as the
// boy, and a kid saved before kids had an emoji shows him too.
export const KID_EMOJIS = ['👦', '👧'];
export const DEFAULT_KID_EMOJI = '👦';

// What a kid did (shouting, lying, too much screen, bedtime…) and ways to make
// it right that cost no coins: a hug, saying sorry, tidying up.
export const CONSEQUENCE_EMOJIS = [
  '⚖️', '🛑', '😡', '😤', '😭', '😝', '🤥', '🙉',
  '🗯️', '🦷', '💦', '🚪', '🧦', '🍬', '📱', '📺',
  '🎮', '⏰', '🤗', '🙏', '🧹', '✍️', '🤝', '💐',
];

type IconBadgeProps = {
  icon: Icon;
  fallbackEmoji: string;
  size?: number;
};

export function IconBadge({ icon, fallbackEmoji, size = 48 }: IconBadgeProps) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  const photoUri = shownPhoto(icon.photoUri);

  if (photoUri) {
    return <Image source={{ uri: photoUri }} style={[shape, styles.photo]} />;
  }

  return (
    <View style={[shape, styles.badge]}>
      <Text style={{ fontSize: size * 0.5 }}>{icon.emoji ?? fallbackEmoji}</Text>
    </View>
  );
}

type IconPickerProps = {
  value: Icon;
  fallbackEmoji: string;
  onChange: (icon: Icon) => void;
  // The emojis to choose from; tasks and wishes share ICON_EMOJIS.
  emojis?: readonly string[];
};

export function IconPicker({ value, fallbackEmoji, onChange, emojis = ICON_EMOJIS }: IconPickerProps) {
  const selectedEmoji = value.photoUri ? null : (value.emoji ?? fallbackEmoji);

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        <IconBadge icon={value} fallbackEmoji={fallbackEmoji} size={96} />
      </View>

      <View style={styles.emojis}>
        {emojis.map((emoji) => {
          const selected = selectedEmoji === emoji;
          return (
            <Pressable
              key={emoji}
              style={[styles.emojiButton, selected && styles.selected]}
              onPress={() => onChange({ emoji, photoUri: null })}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>

      <PhotoSourceButtons
        selected={value.photoUri != null}
        onPhoto={(uri) => onChange({ emoji: null, photoUri: uri })}
      />
    </View>
  );
}

const EMOJI_SIZE = 52;

const styles = StyleSheet.create({
  badge: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  photo: { borderWidth: 3, borderColor: colors.border },
  container: { gap: spacing.md, alignItems: 'stretch' },
  preview: { alignSelf: 'center' },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  emojiButton: {
    width: EMOJI_SIZE,
    height: EMOJI_SIZE,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 26 },
  selected: { borderColor: colors.primary, backgroundColor: colors.border },
});
