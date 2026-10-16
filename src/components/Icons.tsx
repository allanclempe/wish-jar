import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Icon } from '../db';
import { frameoPhotos } from '../photos/frameo';
import { usePickPhoto } from '../photos/PhotoPicker';
import { colors, radius, spacing, typography } from '../theme';

export const ICON_EMOJIS = [
  '🧹', '🪥', '🛏️', '🧽', '🧺', '🍽️', '📚', '🐶',
  '🌱', '🚲', '🎁', '🧸', '🎮', '🎨', '⚽', '🏊',
  '🍦', '🍕', '🍭', '👟', '📺', '🎈', '🦄', '🚀',
];

// What a kid did wrong: hitting, shouting, lying, too much screen, bedtime…
export const PUNISHMENT_EMOJIS = [
  '🚫', '🛑', '😡', '🤬', '😤', '😭', '😝', '🤥',
  '🙉', '🗯️', '👊', '🦶', '🦷', '💦', '🥊', '💥',
  '🚪', '🧦', '🍬', '📱', '📺', '🎮', '⏰', '🛏️',
];

type IconBadgeProps = {
  icon: Icon;
  fallbackEmoji: string;
  size?: number;
};

export function IconBadge({ icon, fallbackEmoji, size = 48 }: IconBadgeProps) {
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (icon.photoUri) {
    return <Image source={{ uri: icon.photoUri }} style={[shape, styles.photo]} />;
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
  const pickPhoto = usePickPhoto();

  async function choosePhoto() {
    const uri = await pickPhoto();
    if (uri) onChange({ emoji: null, photoUri: uri });
  }

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

      <Pressable
        style={[styles.gallery, value.photoUri && styles.selected]}
        onPress={choosePhoto}
        accessibilityRole="button"
      >
        <Text style={styles.galleryText}>
          {frameoPhotos ? '📷 Pick a photo sent with Frameo' : '📷 Pick a photo from your gallery'}
        </Text>
      </Pressable>
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
  gallery: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  galleryText: { ...typography.body, color: colors.text, fontWeight: '600' },
});
