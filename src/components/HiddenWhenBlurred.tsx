import { useIsFocused } from 'expo-router';
import { useLayoutEffect, useRef, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

// What a View is on the web: its DOM element.
type WebNode = { style: { setProperty(name: string, value: string): void } };

// Hides a tab's screen while another tab is in front. On the web the tab
// navigator keeps every tab mounted and drawn under the focused one, so on
// the slow frame every tab added to the work of a tick. content-visibility:
// hidden skips a tab's rendering and pauses its animations but keeps its
// layout, so switching back is quicker than from display: none, which lays
// the whole tab out again, and needs no React work, which <Activity> did to
// reconnect the tab's effects. react-native-web drops the property from
// styles, so it goes on the element directly. Phones detach unfocused tabs
// themselves.
export function HiddenWhenBlurred({ children }: PropsWithChildren) {
  const focused = useIsFocused();
  const ref = useRef<View>(null);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;
    (ref.current as unknown as WebNode).style.setProperty('content-visibility', focused ? 'visible' : 'hidden');
  }, [focused]);

  return (
    <View ref={ref} style={styles.fill}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
