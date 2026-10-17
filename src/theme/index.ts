import { Platform } from 'react-native';

export const colors = {
  primary: '#FF8A3D',
  primaryDark: '#D96A1E',
  secondary: '#4DC9F6',
  accent: '#FF5D8F',
  background: '#FFF8F0',
  surface: '#FFFFFF',
  text: '#3D2C2E',
  textMuted: '#8A7A7C',
  success: '#6FCF97',
  successDark: '#27AE60',
  sunshine: '#FFC93C',
  sunshineDark: '#E0A800',
  sky: '#E3F6FD',
  border: '#FFE3CC',
};

// Pastel backgrounds for tiles with an emoji instead of a photo. A tile picks
// one from its id so neighbours differ and a task keeps its colour.
export const pastels = ['#FFE3CC', '#E3F6FD', '#E6F7EC', '#F1E6FF', '#FFF3C4'] as const;

export function pastelFor(id: number): string {
  return pastels[Math.abs(id) % pastels.length];
}

// The tasks screen is a sky that follows the task period. The title and
// subtitle colours pass 4.5:1 on the top of each gradient, where the header
// sits: the mockup's grey subtitle on the afternoon sky and its yellow stars
// do not.
export type SkyColors = {
  gradient: readonly [string, string, string];
  title: string;
  subtitle: string;
  sun: string;
  sunGlow: string;
  cloud: string;
  cloudOpacity: number;
  hills: readonly [string, string];
};

export const skies: Record<'morning' | 'afternoon' | 'evening', SkyColors> = {
  morning: {
    gradient: ['#FFB86B', '#FFD9A6', '#FFF1DA'],
    title: colors.text,
    subtitle: '#6B3F1D',
    sun: '#FFF6C8',
    sunGlow: '#FFD24D',
    cloud: '#FFFFFF',
    cloudOpacity: 0.92,
    hills: ['#BFE59A', '#A9D97F'],
  },
  afternoon: {
    gradient: ['#45C3F2', '#9EE0FA', '#E3F6FD'],
    title: colors.text,
    subtitle: '#173D52',
    sun: '#FFFBE0',
    sunGlow: '#FFE066',
    cloud: '#FFFFFF',
    cloudOpacity: 0.92,
    hills: ['#BFE59A', '#A9D97F'],
  },
  evening: {
    gradient: ['#1B1F55', '#3E3A86', '#7A62B1'],
    title: '#FFFFFF',
    subtitle: '#D9CFF2',
    sun: '#FFF4C2',
    sunGlow: '#E9D98F',
    cloud: '#FFFFFF',
    cloudOpacity: 0.18,
    hills: ['#2F4A63', '#243A50'],
  },
};

// The wishes tab is a dream board: a starry night at any hour, a touch more
// violet than the evening sky so the two tabs read as different places.
export const dreamSky: SkyColors = {
  gradient: ['#22194F', '#4A3A8C', '#8A6BC4'],
  title: '#FFFFFF',
  subtitle: '#E4DAF7',
  sun: '#FFF4C2',
  sunGlow: '#E9D98F',
  cloud: '#FFFFFF',
  cloudOpacity: 0.16,
  hills: ['#3B3F7A', '#2C3161'],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};

// The fonts loaded in app/_layout.tsx: Baloo 2 for anything that shouts
// (titles, numbers, buttons), Fredoka for the rest. Each weight is its own
// family, so styles pick a family and never set fontWeight: a fontWeight on a
// loaded font falls back to the platform font on Android.
//
// On web, `System` follows so emoji and symbols the fonts don't have (✓ ✕ ☆ ⌫)
// come from the platform stack, where the frame registers Twemoji as
// "Segoe UI" (frame/web/frame.css), and so does emojiFallback.web.ts on other
// devices that can't draw newer emoji.
function family(name: string) {
  return Platform.select({ web: `${name}, System`, default: name });
}

export const fonts = {
  display: family('Baloo2_800ExtraBold'),
  medium: family('Fredoka_500Medium'),
  semibold: family('Fredoka_600SemiBold'),
  bold: family('Fredoka_700Bold'),
};

// Baloo 2 has tall ascenders and a loose default line, so its sizes carry a
// lineHeight; Fredoka's default line is fine.
export const typography = {
  hero: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27 },
  body: { fontFamily: fonts.medium, fontSize: 17 },
  caption: { fontFamily: fonts.medium, fontSize: 14 },
};

// The widest a column of rows or a form gets: stretched across a 1280-wide
// frame they are hard to read.
export const contentMaxWidth = 760;

// A solid shadow a few pixels below, like a sticker lifted off the page.
// Android 7 and 8 have no boxShadow and just draw it flat.
export function offsetShadow(color: string, height = 4) {
  return { boxShadow: `0 ${height}px 0 ${color}` };
}

export const shadow = offsetShadow('rgba(61, 44, 46, 0.18)');
export const primaryShadow = offsetShadow(colors.primaryDark);
export const sunshineShadow = offsetShadow(colors.sunshineDark);

export { useLargeScreen, useTabsOnTop } from './layout';
