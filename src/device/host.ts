import { Platform } from 'react-native';

// The devices that open the site with a ?host= of their own:
// - The Echo Show's Alexa skill opens https://wish-jar.blastin.dev/?host=alexa.
//   Its web view can't pick or take a photo (file inputs and the camera do
//   nothing, and a page can't tell in advance), so photos come from a parent's
//   phone there instead (WJ-40).
// - The Frameo frame's app (frame/) opens ?host=frameo (WJ-69). It has no
//   camera and no photos of its own, so photos come from a phone there too,
//   and the family jar's photos show as a slideshow while nobody is using it.
//
// The flag is read once at startup and kept in sessionStorage for the tab's
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

const host = readHost();

export const onEchoShow = host === 'alexa';
export const onFrame = host === 'frameo';
