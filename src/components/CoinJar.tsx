import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';
import { useNativeDriver } from './Animations';

// The jar is drawn in the mockup's coordinate space (mock.js `jar()`), a
// 128 x 160 viewBox starting at (-2, -6); everything below is in those units
// and scaled to `size` at render time.
const VIEW_BOX = '-2 -6 128 160';
const VIEW_X = -2;
const VIEW_Y = -6;
const VIEW_WIDTH = 128;
const VIEW_HEIGHT = 160;

// A rounded rectangle from (14, 34) to (110, 148): 12 at the top corners, 18
// at the bottom. Because it is one, a View with overflow hidden and the same
// radii clips the coins to it, with no SVG clipPath per layer.
const BODY = 'M26 34 h72 a12 12 0 0 1 12 12 v84 a18 18 0 0 1 -18 18 h-60 a18 18 0 0 1 -18 -18 v-84 a12 12 0 0 1 12 -12 z';
const BODY_LEFT = 14;
const BODY_TOP = 34;
const BODY_WIDTH = 96;
const BODY_HEIGHT = 114;
const BODY_TOP_RADIUS = 12;
const BODY_BOTTOM_RADIUS = 18;

// Coins stack in up to five layers of two or three, seen edge-on. Each layer
// is its own small SVG so a transform on the View around it bounces that
// layer alone while the SVG stays static.
export const COIN_LAYERS = 5;
const LAYER_GAP = 17;
const LAYER_BOTTOM_Y = 136;
// Wide enough for the widest coin plus its stroke and tilt.
const LAYER_LEFT = 18;
const LAYER_WIDTH = 88;
const LAYER_HEIGHT = 24;

const GLASS = '#E8F7FD';
const GLASS_FILL = 'rgba(232, 247, 253, 0.92)';
const COIN_SHINE = '#FFF0B3';
const CHEEK = '#FF9EB5';
const OUTLINE = colors.text;

type Coin = { x: number; y: number; rotate: number };

function coinsInLayer(layer: number): Coin[] {
  const y = LAYER_BOTTOM_Y - layer * LAYER_GAP;
  const xs = layer % 2 === 0 ? [40, 62, 84] : [50, 73];
  return xs.map((x, j) => ({
    x: x + (((layer * 7 + j * 11) % 9) - 4),
    y,
    rotate: ((layer + j) % 3) * 6 - 6,
  }));
}

const LAYERS = Array.from({ length: COIN_LAYERS }, (_, layer) => coinsInLayer(layer));

// How full each layer is for `done` of `total` tasks: with up to five tasks a
// tick fills one layer; with more, every tick grows the next layer a step.
export function layerFill(done: number, total: number): number[] {
  const layers = Math.min(total, COIN_LAYERS);
  return Array.from({ length: COIN_LAYERS }, (_, layer) => {
    if (total <= 0 || layer >= layers) return 0;
    return Math.min(1, Math.max(0, (done / total) * layers - layer));
  });
}

type CoinJarProps = {
  done: number;
  total: number;
  // The jar's height; it is four fifths as wide.
  size?: number;
  style?: StyleProp<ViewStyle>;
};

// The Wish Jar: a glass jar with a face that fills with gold coins as tasks
// get ticked. Its lid sits tilted on top until the last task, when it closes
// and the jar sparkles and grins. Decorative, not tappable: the progress it
// shows is read out by the count next to it.
export function CoinJar({ done, total, size = 112, style }: CoinJarProps) {
  const scale = size / VIEW_HEIGHT;
  const width = VIEW_WIDTH * scale;
  const full = total > 0 && done >= total;
  const fills = layerFill(done, total);

  const [layers] = useState(() => fills.map((fill) => new Animated.Value(fill)));
  const [bounce] = useState(() => new Animated.Value(1));
  const previousDone = useRef(done);

  useEffect(() => {
    const steps = fills.map((fill, index) =>
      fill > 0
        ? Animated.spring(layers[index], { toValue: fill, friction: 4, tension: 120, useNativeDriver })
        : Animated.timing(layers[index], { toValue: 0, duration: 150, useNativeDriver }),
    );
    // A small squish of the whole jar on each tick or un-tick, not on load.
    if (done !== previousDone.current) {
      previousDone.current = done;
      bounce.setValue(0.94);
      steps.push(Animated.spring(bounce, { toValue: 1, friction: 3, tension: 160, useNativeDriver }));
    }
    const animation = Animated.parallel(steps);
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, total]);

  const px = (x: number) => (x - VIEW_X) * scale;
  const py = (y: number) => (y - VIEW_Y) * scale;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height: size, transform: [{ scale: bounce }] }, style]}
    >
      {/* The glass behind the coins. */}
      <Svg width={width} height={size} viewBox={VIEW_BOX}>
        <Path d={BODY} fill={GLASS_FILL} />
      </Svg>
      <View
        style={[
          styles.clip,
          {
            left: px(BODY_LEFT),
            top: py(BODY_TOP),
            width: BODY_WIDTH * scale,
            height: BODY_HEIGHT * scale,
            borderTopLeftRadius: BODY_TOP_RADIUS * scale,
            borderTopRightRadius: BODY_TOP_RADIUS * scale,
            borderBottomLeftRadius: BODY_BOTTOM_RADIUS * scale,
            borderBottomRightRadius: BODY_BOTTOM_RADIUS * scale,
          },
        ]}
      >
        {LAYERS.map((coins, layer) => {
          const top = LAYER_BOTTOM_Y - layer * LAYER_GAP - LAYER_HEIGHT / 2;
          return (
            <Animated.View
              key={layer}
              style={[
                styles.layer,
                {
                  left: px(LAYER_LEFT) - px(BODY_LEFT),
                  top: py(top) - py(BODY_TOP),
                  width: LAYER_WIDTH * scale,
                  height: LAYER_HEIGHT * scale,
                  transform: [{ scale: layers[layer] }],
                },
              ]}
            >
              <Svg
                width={LAYER_WIDTH * scale}
                height={LAYER_HEIGHT * scale}
                viewBox={`${LAYER_LEFT} ${top} ${LAYER_WIDTH} ${LAYER_HEIGHT}`}
              >
                {coins.map((coin, index) => (
                  <G key={index} transform={`translate(${coin.x} ${coin.y}) rotate(${coin.rotate})`}>
                    <Ellipse rx={14} ry={8} fill={colors.sunshine} stroke={colors.sunshineDark} strokeWidth={3} />
                    <Ellipse rx={6} ry={2.5} cy={-2} fill={COIN_SHINE} />
                  </G>
                ))}
              </Svg>
            </Animated.View>
          );
        })}
      </View>
      {/* The outline, shine, face and lid over the coins. */}
      <Svg width={width} height={size} viewBox={VIEW_BOX} style={StyleSheet.absoluteFill}>
        <Path d={BODY} fill="none" stroke={OUTLINE} strokeWidth={4} />
        <Path d="M36 52 v62" stroke="#fff" strokeWidth={6} strokeLinecap="round" opacity={0.75} />
        {full ? (
          <>
            <Path d="M46 86 q7 -9 14 0" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
            <Path d="M64 86 q7 -9 14 0" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
            <Path d="M50 98 q12 16 24 0" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
            <Circle cx={40} cy={96} r={5} fill={CHEEK} opacity={0.8} />
            <Circle cx={84} cy={96} r={5} fill={CHEEK} opacity={0.8} />
          </>
        ) : (
          <>
            <Circle cx={52} cy={84} r={6} fill={OUTLINE} />
            <Circle cx={72} cy={84} r={6} fill={OUTLINE} />
            <Circle cx={54} cy={82} r={2} fill="#fff" />
            <Circle cx={74} cy={82} r={2} fill="#fff" />
            <Path d="M54 98 q8 8 16 0" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          </>
        )}
        {full ? (
          <Rect x={30} y={6} width={64} height={20} rx={7} fill={colors.primary} stroke={OUTLINE} strokeWidth={4} />
        ) : (
          <G transform="translate(78 10) rotate(18)">
            <Rect x={-32} y={-10} width={64} height={20} rx={7} fill={colors.primary} stroke={OUTLINE} strokeWidth={4} />
          </G>
        )}
        <Rect x={36} y={24} width={52} height={10} fill={GLASS} stroke={OUTLINE} strokeWidth={4} />
      </Svg>
      {/* Text rather than SVG text so the frame's Twemoji font draws them. */}
      {full ? (
        <>
          <Text style={[styles.sparkle, { left: px(104), top: py(2), fontSize: 22 * scale }]}>✨</Text>
          <Text style={[styles.sparkle, { left: px(4), top: py(24), fontSize: 18 * scale }]}>✨</Text>
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', overflow: 'hidden' },
  layer: { position: 'absolute' },
  sparkle: { position: 'absolute' },
});
