import { memo } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Path,
  Rect,
} from 'react-native-svg';

import { colors } from '../theme';

// Wish Jar's logo: the jar of its icon (assets/brand/jar.svg, WJ-77), drawn
// here with the same shapes so it stays sharp at any size. It stands where 🫙
// used to, as an SVG it draws the same on every device, the frame included.
const VIEW_BOX = '4 2 112 116';
const ASPECT = 112 / 116;

const GLASS = '#E8F7FD';
const CHEEK = '#FF9EB5';
const OUTLINE = colors.text;

type JarLogoProps = {
  // Its height; it's a little narrower than that.
  size?: number;
};

export const JarLogo = memo(function JarLogo({ size = 80 }: JarLogoProps) {
  return (
    // Decorative: the title next to it says what it is. The props hiding it
    // are on a View, as the web's <svg> would take them for attributes.
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
    >
      <Svg width={size * ASPECT} height={size} viewBox={VIEW_BOX}>
        <Defs>
          <ClipPath id='jar-logo-body'>
            <Rect x={10} y={34} width={100} height={78} rx={24} />
          </ClipPath>
        </Defs>
        <Rect x={10} y={34} width={100} height={78} rx={24} fill={GLASS} />
        <G
          clipPath='url(#jar-logo-body)'
          stroke={colors.sunshineDark}
          strokeWidth={5}
          fill={colors.sunshine}
        >
          <Ellipse cx={34} cy={104} rx={20} ry={11} />
          <Ellipse cx={86} cy={104} rx={20} ry={11} />
          <Ellipse cx={60} cy={98} rx={20} ry={11} />
        </G>
        <Rect
          x={10}
          y={34}
          width={100}
          height={78}
          rx={24}
          fill='none'
          stroke={OUTLINE}
          strokeWidth={6}
        />
        <G fill='none' stroke={OUTLINE} strokeWidth={6} strokeLinecap='round'>
          <Path d='M36 60 q7 -9 14 0' />
          <Path d='M70 60 q7 -9 14 0' />
        </G>
        <Path
          d='M46 70 q14 15 28 0 z'
          fill={OUTLINE}
          stroke={OUTLINE}
          strokeWidth={5}
          strokeLinejoin='round'
        />
        <Circle cx={28} cy={72} r={6} fill={CHEEK} />
        <Circle cx={92} cy={72} r={6} fill={CHEEK} />
        <Rect
          x={16}
          y={8}
          width={88}
          height={22}
          rx={9}
          fill={colors.primary}
          stroke={OUTLINE}
          strokeWidth={6}
        />
      </Svg>
    </View>
  );
});
