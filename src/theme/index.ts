export const colors = {
  primary: '#FF8A3D',
  secondary: '#4DC9F6',
  accent: '#FF5D8F',
  background: '#FFF8F0',
  surface: '#FFFFFF',
  text: '#3D2C2E',
  textMuted: '#8A7A7C',
  success: '#6FCF97',
  successDark: '#27AE60',
  sunshine: '#FFC93C',
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

export const typography = {
  hero: { fontSize: 34, fontWeight: '900' as const },
  title: { fontSize: 28, fontWeight: '800' as const },
  heading: { fontSize: 22, fontWeight: '700' as const },
  body: { fontSize: 17, fontWeight: '400' as const },
  caption: { fontSize: 14, fontWeight: '400' as const },
};

export const shadow = {
  shadowColor: colors.primary,
  shadowOpacity: 0.15,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export { useLargeScreen } from './layout';
