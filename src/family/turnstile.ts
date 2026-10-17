// The site key of the Cloudflare Turnstile widget that starting a family needs
// (WJ-54). The relay holds the widget's secret key; relay/README.md says how
// the widget is made. The web app renders the widget itself
// (TurnstileCheck.web.tsx); the phone app shows the relay's /turnstile page
// at JAR_URL, wish-jar-api.blastin.dev (TurnstileCheck.tsx), which takes this
// key too. The widget lists the hostnames of both: the site
// (wish-jar.blastin.dev, and wish-jar.expo.app until every device has moved),
// the frame's appassets.androidplatform.net, the relay and localhost.
//
// Until the widget is made this is Cloudflare's test key, which always passes
// and whose dummy token only the test secret (`pnpm dev` in relay/) accepts.
// EXPO_PUBLIC_TURNSTILE_SITE_KEY swaps it for a dev build, next to
// EXPO_PUBLIC_JAR_URL (src/db/jar.ts).
export const TURNSTILE_SITE_KEY =
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';
