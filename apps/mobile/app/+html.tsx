// The HTML around every page of the web export, which runs only while
// `expo export -p web` renders the pages, never in the app. The same tags as
// Expo Router's default page, plus Cloudflare Web Analytics (WJ-82).
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Cloudflare Web Analytics counts page views without cookies or anything that
// tells one visitor from another. Its token isn't a secret: the site's export
// takes it from the CF_ANALYTICS_TOKEN variable in GitHub Actions
// (.github/workflows/site.yml). Without it, as in dev builds, the page loads
// no beacon.
const ANALYTICS_TOKEN = process.env.EXPO_PUBLIC_CF_ANALYTICS_TOKEN;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <ScrollViewStyleReset />
      </head>
      <body>
        {children}
        {ANALYTICS_TOKEN ? (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: ANALYTICS_TOKEN })}
          />
        ) : null}
      </body>
    </html>
  );
}
