import { onFrame } from './host';

// A long press is how a grown-up opens the 🔒 settings, but the frame's
// WebView turns a long press into a text selection, which swallows the hold.
// Nothing outside a text field needs selecting on the frame.
const FRAME_STYLE = `
* {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
input,
textarea {
  -webkit-user-select: text;
  user-select: text;
}`;

export function installFrameStyle(): void {
  if (!onFrame || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = FRAME_STYLE;
  document.head.appendChild(style);
}
