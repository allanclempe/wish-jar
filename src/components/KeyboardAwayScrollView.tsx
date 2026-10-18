import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type GestureResponderEvent,
  type ScrollViewProps,
} from 'react-native';

// A ScrollView where tapping anywhere but a field puts the keyboard away, on
// every device: the ScrollView's own dismissal doesn't reach every platform,
// and taps beside a centred column fall outside it. `contentContainerStyle`
// goes on the tappable area, so it should grow (flexGrow: 1) to fill the
// screen.
export function KeyboardAwayScrollView({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  return (
    <ScrollView {...props} contentContainerStyle={styles.grow} keyboardShouldPersistTaps="handled">
      <Pressable
        // Not a button: no pointer cursor and no stop for the Tab key on web.
        style={[styles.area, contentContainerStyle]}
        tabIndex={-1}
        onPress={dismissKeyboard}
        accessible={false}
        focusable={false}
        android_disableSound
      >
        {children}
      </Pressable>
    </ScrollView>
  );
}

function dismissKeyboard(event: GestureResponderEvent) {
  // On web a tap on a field reaches here too: its keyboard stays up. On the
  // phone apps a field takes its own taps.
  const target = event.target as unknown as { closest?: (selector: string) => unknown };
  if (Platform.OS === 'web' && target.closest?.('input, textarea')) return;
  Keyboard.dismiss();
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
  area: { cursor: 'auto' },
});
