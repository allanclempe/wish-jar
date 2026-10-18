import { htmlResponse } from './pages';

// Starting a family needs a Turnstile check (WJ-54): POST /families is the
// only way to get a device token without one already. Wish Jar on the web
// renders Cloudflare's widget itself; the phone app shows this relay's
// /turnstile page in a WebView. Either way the widget's token comes in this
// header, and Cloudflare says whether it's good.
// relay/README.md says how the widget and its secret key are set up.
export const TURNSTILE_HEADER = 'Turnstile-Token';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Cloudflare's tokens are never longer.
const MAX_TOKEN_LENGTH = 2048;
// A site key goes into the page as it is, so only what one looks like.
const SITE_KEY = /^[A-Za-z0-9_-]{1,100}$/;

// 'passed', 'failed' (no token, or Cloudflare turned it down: expired, used
// already, made for another widget), or 'unavailable' when Cloudflare didn't
// answer, which the same token may get past later. A token passes only once.
export type TurnstileOutcome = 'passed' | 'failed' | 'unavailable';

export async function checkTurnstile(request: Request, env: Env): Promise<TurnstileOutcome> {
  const token = request.headers.get(TURNSTILE_HEADER);
  if (!token || token.length > MAX_TOKEN_LENGTH) return 'failed';

  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.set('remoteip', ip);

  let outcome: { success?: unknown; 'error-codes'?: unknown };
  try {
    const response = await fetch(SITEVERIFY, { method: 'POST', body: form });
    if (!response.ok) return 'unavailable';
    outcome = await response.json();
  } catch {
    return 'unavailable';
  }
  if (outcome.success === true) return 'passed';
  const errors = Array.isArray(outcome['error-codes']) ? outcome['error-codes'] : [];
  return errors.includes('internal-error') ? 'unavailable' : 'failed';
}

// GET /turnstile?sitekey=…: the widget on a page of its own, for the phone
// app's WebView (src/family/TurnstileCheck.tsx in the app), which hears the
// token through window.ReactNativeWebView. The site key comes from the app,
// so it's set in one place; this relay's hostname (wish-jar-api.blastin.dev,
// where the app opens it) has to be on the widget's list.
export function turnstilePage(url: URL): Response {
  const siteKey = url.searchParams.get('sitekey') ?? '';
  if (!SITE_KEY.test(siteKey)) {
    return new Response('Say which widget: ?sitekey=', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return htmlResponse(page(siteKey), 200, TURNSTILE_POLICY);
}

// The pages' strict policy (src/pages.ts), with Cloudflare's script and its
// frame let in.
const TURNSTILE_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  'connect-src https://challenges.cloudflare.com',
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

function page(siteKey: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Wish Jar</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    background: #FFF8F0;
    color: #8A7A7C;
    font: 16px/1.45 ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
  }
  p { margin: 0 16px; }
  [hidden] { display: none !important; }
  button {
    padding: 12px 24px;
    border: 0;
    border-radius: 999px;
    background: #FF8A3D;
    color: #fff;
    font: inherit;
    font-weight: 700;
  }
</style>
</head>
<body>
<div id="widget"></div>
<p id="note" hidden>That didn't work.</p>
<button id="again" hidden>Try again</button>
<script>
  function tell(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  function failed(isFailed) {
    document.getElementById('note').hidden = !isFailed;
    document.getElementById('again').hidden = !isFailed;
  }
  var widget;
  document.getElementById('again').addEventListener('click', function () {
    failed(false);
    turnstile.reset(widget);
  });
  window.onTurnstileLoad = function () {
    widget = turnstile.render('#widget', {
      sitekey: ${JSON.stringify(siteKey)},
      theme: 'light',
      callback: function (token) {
        failed(false);
        tell({ token: token });
      },
      // Handled here: a button to run the check again.
      'error-callback': function () {
        failed(true);
        return true;
      },
    });
  };
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad" async defer></script>
</body>
</html>`;
}
