import { Dimensions, Platform, useWindowDimensions } from 'react-native';

// Tablets and photo frames (a 10.1" 1280x800 frame is 800 dp on its short
// side) get bigger touch targets and use their width; phones never do.
const LARGE_SCREEN_MIN_DP = 600;

// Below this width, a large screen held upright (or a browser window that
// narrow) has no room for the kids, the tabs, the coins and the lock in one bar.
const TABS_ON_TOP_MIN_WIDTH_DP = 800;

// The size the layout follows. On a device it is the screen, not the window:
// an open keyboard shrinks the window (to 390 dp tall on the frame), and the
// layout must not flip to the phone one while someone types. In a browser the
// screen is the whole monitor, so it is the window, which the user resizes.
function useLayoutSize(): { width: number; height: number } {
  // Re-renders on rotation and resizing, whichever size is read.
  const window = useWindowDimensions();
  return Platform.OS === 'web' ? window : Dimensions.get('screen');
}

export function useLargeScreen(): boolean {
  const { width, height } = useLayoutSize();
  return Math.min(width, height) >= LARGE_SCREEN_MIN_DP;
}

// Where the tabs go: in the kids bar at the top in landscape and on wide
// screens, where height is short and width is plenty; at the bottom, in reach
// of a thumb, on phones held upright and narrow browser windows.
export function useTabsOnTop(): boolean {
  const { width, height } = useLayoutSize();
  return width > height || width >= TABS_ON_TOP_MIN_WIDTH_DP;
}
