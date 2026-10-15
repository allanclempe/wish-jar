import { Dimensions } from 'react-native';

// Tablets and photo frames (a 10.1" 1280x800 frame is 800 dp on its short
// side) get bigger touch targets and use their width; phones never do.
const LARGE_SCREEN_MIN_DP = 600;

// Decided by the device's screen, not the window: an open keyboard shrinks
// the window (to 390 dp tall on the frame), and the layout must not flip to
// the phone one while someone types.
export function useLargeScreen(): boolean {
  const { width, height } = Dimensions.get('screen');
  return Math.min(width, height) >= LARGE_SCREEN_MIN_DP;
}
