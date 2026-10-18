// The site's Worker (wrangler.jsonc). Pages come from dist/ without reaching
// it. It only sees the API's paths, which wish-jar.blastin.dev served until
// the API moved to wish-jar-api.blastin.dev (WJ-63): photo URLs saved in
// family jars and the frame app's build still use this address, so they go
// on to the API unchanged.
//
// `/devices` is the API's list of a family's devices and also the app's
// Devices page (app/devices.tsx). A browser loading or reloading the page asks
// for HTML, which the API's answer never is, so it gets the page (WJ-65).
export default {
  fetch(request, env) {
    if (isDevicesPage(request)) return env.ASSETS.fetch(request);
    return env.API.fetch(request);
  },
};

function isDevicesPage(request) {
  const { pathname } = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (pathname !== '/devices') return false;
  return (request.headers.get('Accept') || '').includes('text/html');
}
