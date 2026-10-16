import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type DimensionValue } from 'react-native';

import type { Period } from '../db';
import { skies, useLargeScreen } from '../theme';

type SkyProps = { period: Period };

// The background of the kid screens: a gradient sky for the period with a sun
// or a moon, a couple of clouds, stars at night and hills along the bottom.
// Plain Views, no emoji, so a phone and the frame draw the same picture, and
// a handful of them, since the frame is a slow Android 6 device. Nothing moves.
export function Sky({ period }: SkyProps) {
  const large = useLargeScreen();
  const sky = skies[period];

  return (
    <LinearGradient colors={sky.gradient} style={styles.sky}>
      {period === 'morning' ? <Sun size={170} left={-40} top={30} period={period} /> : null}
      {period === 'afternoon' ? <Sun size={220} right={-60} top={-70} period={period} /> : null}
      {period === 'evening' ? (
        <>
          <Moon right={large ? '22%' : 36} top={large ? 22 : 26} />
          <Stars />
        </>
      ) : null}
      <Cloud left="46%" top={large ? 40 : 190} width={large ? 96 : 110} period={period} />
      <Cloud right="10%" top={large ? 230 : 300} width={80} period={period} />
      {large ? <Cloud left="12%" top={250} width={70} period={period} /> : null}
      <View style={[styles.hills, styles.hillsA, { backgroundColor: sky.hills[0] }]} />
      <View style={[styles.hills, styles.hillsB, { backgroundColor: sky.hills[1] }]} />
    </LinearGradient>
  );
}

type Edge = DimensionValue | undefined;

// A bright disc inside a soft halo, in place of the mockup's radial gradient.
function Sun({
  size,
  period,
  ...position
}: {
  size: number;
  period: Period;
  left?: Edge;
  right?: Edge;
  top?: Edge;
}) {
  const sky = skies[period];
  const inner = size * 0.56;
  return (
    <View style={[styles.round, { width: size, height: size }, position]}>
      <View style={[styles.round, StyleSheet.absoluteFill, { backgroundColor: sky.sunGlow, opacity: 0.45 }]} />
      <View
        style={[
          styles.round,
          {
            width: inner,
            height: inner,
            margin: (size - inner) / 2,
            backgroundColor: sky.sun,
            opacity: 0.9,
          },
        ]}
      />
    </View>
  );
}

function Moon({ right, top }: { right: Edge; top: Edge }) {
  const sky = skies.evening;
  return (
    <View style={[styles.moonBox, { right, top }]}>
      <View style={[styles.round, StyleSheet.absoluteFill, { backgroundColor: sky.sunGlow, opacity: 0.35 }]} />
      <View style={[styles.round, styles.moon, { backgroundColor: sky.sun }]}>
        {/* The shaded edge and three craters are discs in the darker cream. */}
        <View style={[styles.round, styles.moonShade, { backgroundColor: sky.sunGlow }]} />
        <View style={[styles.round, styles.crater, { left: 16, top: 22 }, { backgroundColor: sky.sunGlow }]} />
        <View style={[styles.round, styles.crater, { left: 44, top: 36, width: 8, height: 8 }, { backgroundColor: sky.sunGlow }]} />
        <View style={[styles.round, styles.crater, { left: 26, top: 52, width: 6, height: 6 }, { backgroundColor: sky.sunGlow }]} />
      </View>
    </View>
  );
}

const STARS: { left: DimensionValue; top: number; size: number }[] = [
  { left: '8%', top: 40, size: 7 },
  { left: '30%', top: 110, size: 5 },
  { left: '52%', top: 60, size: 8 },
  { left: '66%', top: 150, size: 5 },
  { left: '84%', top: 90, size: 6 },
  { left: '94%', top: 200, size: 5 },
  { left: '20%', top: 230, size: 4 },
];

// Tilted squares read as twinkles at this size and cost nothing to draw.
function Stars() {
  return (
    <>
      {STARS.map((star, index) => (
        <View
          key={index}
          style={[
            styles.star,
            { left: star.left, top: star.top, width: star.size, height: star.size },
          ]}
        />
      ))}
    </>
  );
}

// A pill with two bumps on top.
function Cloud({
  width,
  period,
  ...position
}: {
  width: number;
  period: Period;
  left?: Edge;
  right?: Edge;
  top: number;
}) {
  const sky = skies[period];
  const color = { backgroundColor: sky.cloud };
  return (
    <View style={[styles.cloud, { width, opacity: sky.cloudOpacity }, color, position]}>
      <View style={[styles.round, styles.cloudBumpA, color]} />
      <View style={[styles.round, styles.cloudBumpB, color]} />
    </View>
  );
}

const styles = StyleSheet.create({
  sky: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none' },
  round: { position: 'absolute', borderRadius: 999 },
  moonBox: { position: 'absolute', width: 110, height: 110, marginRight: -18, marginTop: -18 },
  moon: { width: 74, height: 74, left: 18, top: 18, overflow: 'hidden' },
  moonShade: { width: 74, height: 74, left: 18, top: 10, opacity: 0.6 },
  crater: { width: 12, height: 12 },
  star: { position: 'absolute', backgroundColor: '#FFF6C8', transform: [{ rotate: '45deg' }] },
  cloud: { position: 'absolute', height: 28, borderRadius: 999 },
  cloudBumpA: { width: 34, height: 34, left: 16, top: -18 },
  cloudBumpB: { width: 26, height: 26, left: 44, top: -12 },
  hills: { position: 'absolute', height: 130, opacity: 0.9, borderTopLeftRadius: '50%', borderTopRightRadius: '50%' },
  hillsA: { left: '-8%', right: '-8%', bottom: -70 },
  hillsB: { left: '30%', right: '-30%', bottom: -90 },
});
