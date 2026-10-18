// The site key of the Cloudflare Turnstile widget that starting a family needs
// (WJ-54). The relay holds the widget's secret key; relay/README.md says how
// the widget is made. The web app renders the widget itself
// (TurnstileCheck.web.tsx); the phone app shows the relay's /turnstile page
// at JAR_URL (TurnstileCheck.tsx), which takes this key too.
//
// Builds take it from EXPO_PUBLIC_TURNSTILE_SITE_KEY: the site's from the
// TURNSTILE_SITE_KEY variable in GitHub Actions (.github/workflows/site.yml),
// the frame's from the same variable in frame/build.sh. A dev build without it
// gets Cloudflare's test key, which always passes and whose dummy token only
// the test secret (`pnpm dev` in relay/) accepts. A release build without it
// has no key, so the check fails rather than send a token the relay rejects.
const TEST_SITE_KEY = '1x00000000000000000000AA';

export const TURNSTILE_SITE_KEY =
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || (__DEV__ ? TEST_SITE_KEY : '');
