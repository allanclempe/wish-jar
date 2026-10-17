// Older Android web views have emoji fonts that stop before Unicode 14, so
// newer emoji such as 🫙 🪥 🧹 are blank. The Echo Show (Android 9) is one.
// On those, Twemoji is registered as "Segoe UI" for emoji code points only,
// as the frame's own frame.css does: "Segoe UI" is in React Native Web's
// System font stack, so emoji draw with Twemoji and other text keeps its font.
// Devices that can already draw 🫙 skip the 1.4 MB font.
// Twemoji graphics © Twitter, CC-BY 4.0; font build by Mozilla
// (github.com/mozilla/twemoji-colr v0.7.0), served from public/fonts.

const FONT_URL = '/fonts/Twemoji.Mozilla.ttf';
const PROBE = '🫙';

const FONT_FACE = `@font-face {
  font-family: 'Segoe UI';
  src: url('${FONT_URL}') format('truetype');
  font-display: block;
  unicode-range:
    U+200D, U+20E3, U+231A-23FF, U+24C2, U+25AA-25FE, U+2600-27BF, U+2934-2935,
    U+2B05-2B55, U+3030, U+303D, U+3297, U+3299, U+FE0F, U+1F000-1FAFF, U+E0020-E007F;
}`;

// A missing emoji draws as a grey box or nothing; a colour emoji font draws
// coloured pixels.
function canDrawColourEmoji(): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return true;
  context.font = '24px sans-serif';
  context.textBaseline = 'top';
  context.fillText(PROBE, 2, 2);
  const pixels = context.getImageData(0, 0, 32, 32).data;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a > 0 && Math.max(r, g, b) - Math.min(r, g, b) > 40) return true;
  }
  return false;
}

// The frame's kiosk adds its own "Segoe UI" Twemoji face before the app runs.
function hasEmojiFace(): boolean {
  for (const face of document.fonts) {
    if (face.family.replace(/["']/g, '') === 'Segoe UI') return true;
  }
  return false;
}

export function installEmojiFallback(): void {
  if (typeof document === 'undefined' || hasEmojiFace() || canDrawColourEmoji()) return;
  const style = document.createElement('style');
  style.textContent = FONT_FACE;
  document.head.appendChild(style);
}
