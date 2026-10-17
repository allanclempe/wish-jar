import { Platform } from 'react-native';

// Inside the Echo Show's Alexa skill, which opens the site as
// https://wish-jar.expo.app/?host=alexa. Its web view can't pick or take a
// photo (file inputs and the camera do nothing, and a page can't tell in
// advance), so photos come from a parent's phone there instead (WJ-40).
//
// The flag is read once at startup and kept in sessionStorage for the skill's
// session, so client-side navigation (which drops the query) and reloads keep
// it. localStorage is null on the Show; sessionStorage works.
const HOST_KEY = 'wish-jar:host';

function readHost(): string | null {
  // Static rendering has no window.
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const fromUrl = new URLSearchParams(window.location.search).get('host');
  try {
    if (fromUrl) {
      sessionStorage.setItem(HOST_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(HOST_KEY);
  } catch {
    // No sessionStorage: the flag holds until the next full page load.
    return fromUrl;
  }
}

export const onEchoShow = readHost() === 'alexa';
