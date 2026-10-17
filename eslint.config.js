// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // relay/ is a Cloudflare Worker with its own checks (relay/package.json).
    ignores: ["dist/*", "relay/*"],
  }
]);
