const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
// The tick sounds in assets/sounds are Ogg Vorbis, which Metro doesn't bundle by default.
config.resolver.assetExts.push('ogg');

module.exports = config;
