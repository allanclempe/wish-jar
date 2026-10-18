// The site's Worker (wrangler.jsonc). Pages come from dist/ without reaching
// it. It only sees the relay's paths, which wish-jar.blastin.dev served until
// the relay moved to wish-jar-api.blastin.dev (WJ-63): photo URLs saved in
// family jars and the frame app's build still use this address, so they go
// on to the relay unchanged.
export default {
  fetch(request, env) {
    return env.RELAY.fetch(request);
  },
};
