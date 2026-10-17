import { Image, Platform, StyleSheet, View } from 'react-native';
import { SvgUri } from 'react-native-svg';

import { JAR_URL } from '../db/jar';
import { radius } from '../theme';

// The join code's QR code, drawn by the relay as an SVG: it opens Wish Jar in
// the phone's browser with the code filled in. <Image> only draws SVG on web,
// so phones and tablets draw it with react-native-svg.
export function JoinQrCode({ code, size }: { code: string; size: number }) {
  const uri = `${JAR_URL}/qr/join/${code}.svg`;
  const box = { width: size, height: size };
  return (
    <View style={[styles.frame, box]} accessibilityLabel="QR code to scan with a phone's camera">
      {Platform.OS === 'web' ? (
        <Image source={{ uri }} style={box} />
      ) : (
        <SvgUri uri={uri} width={size} height={size} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#fff' },
});
