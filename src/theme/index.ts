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
// "Segoe UI" (frame/web/frame.css).
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
