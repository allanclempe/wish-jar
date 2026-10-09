import { router } from 'expo-router';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Kid } from '../src/db';
import { useActiveKid } from '../src/kids/ActiveKidProvider';
import { colors, radius, spacing, typography } from '../src/theme';

type Tile = { type: 'kid'; kid: Kid } | { type: 'add' };

export default function ChooseKidScreen() {
  const { kids, selectKid } = useActiveKid();

  const tiles: Tile[] = [...kids.map((kid): Tile => ({ type: 'kid', kid })), { type: 'add' }];

  async function choose(kid: Kid) {
    await selectKid(kid.id);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Who is playing?</Text>

        <FlatList
          data={tiles}
          numColumns={2}
          keyExtractor={(tile) => (tile.type === 'kid' ? String(tile.kid.id) : 'add')}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            item.type === 'kid' ? (
              <Pressable
                style={styles.tile}
                onPress={() => choose(item.kid)}
                accessibilityRole="button"
                accessibilityLabel={item.kid.name}
              >
                {item.kid.photoUri ? (
                  <Image source={{ uri: item.kid.photoUri }} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.photoEmpty]}>
                    <Text style={styles.photoEmoji}>🙂</Text>
                  </View>
                )}
                <Text style={styles.name} numberOfLines={1}>
                  {item.kid.name}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.tile, styles.addTile]}
                onPress={() => router.push('/add-kid')}
                accessibilityRole="button"
                accessibilityLabel="Add a kid"
              >
                <View style={[styles.photo, styles.photoEmpty]}>
                  <Text style={styles.photoEmoji}>➕</Text>
                </View>
                <Text style={styles.name}>Add a kid</Text>
              </Pressable>
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

const TILE_PHOTO = 120;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  list: { gap: spacing.md },
  column: { gap: spacing.md, justifyContent: 'center' },
  tile: {
    flex: 1,
    maxWidth: '48%',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  addTile: { borderStyle: 'dashed' },
  photo: { width: TILE_PHOTO, height: TILE_PHOTO, borderRadius: TILE_PHOTO / 2 },
  photoEmpty: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  photoEmoji: { fontSize: 48 },
  name: { ...typography.heading, color: colors.text, textAlign: 'center' },
});
