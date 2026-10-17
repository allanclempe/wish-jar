import type { DropState } from './PhotoDrop';

// The pages a parent's phone opens: plain HTML with a little script, in Wish
// Jar's colours. Everything is inline, so the strict policy below holds.
const POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  'img-src blob:',
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function htmlResponse(html: string, status = 200, policy = POLICY): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': policy,
      'Referrer-Policy': 'no-referrer',
    },
  });
}

// Where a parent types the code shown on Wish Jar, when they can't scan it.
export function homePage(badCode = false): string {
  return layout(`
    <h1>📮 Send a photo to Wish Jar</h1>
    <p>Wish Jar shows a code when it wants a photo. Type it here.</p>
    ${badCode ? `<p class="warn">Hmm, that's not a code. It's 6 letters and numbers, like K7P 4XM.</p>` : ''}
    ${codeForm()}
  `);
}

// The page the QR code opens: pick or take a photo and send it to Wish Jar.
export function codePage(code: string, state: DropState): string {
  if (state === 'gone') {
    return layout(`
      <div class="big">⏰</div>
      <h1>This code has run out</h1>
      <p>A code works for 10 minutes and one photo. Ask Wish Jar for a new one, then scan it again or type it here.</p>
      ${codeForm()}
    `);
  }
  if (state === 'sent') {
    return layout(`
      <div class="big">🎉</div>
      <h1>A photo is already on its way</h1>
      <p>Have a look at Wish Jar. To send another, ask it for a new code.</p>
    `);
  }

  // A file input with accept="image/*" lets phones take a photo or pick one.
  const picker = (label: string, className: string) =>
    `<label class="${className}">${label}<input type="file" accept="image/*" hidden></label>`;

  return layout(`
    <h1>📮 Send a photo to Wish Jar</h1>
    <p class="code">Code <b>${escapeHtml(code)}</b></p>

    <section id="choose">
      <p>Take a photo or pick one. We'll make it square, like Wish Jar's tiles.</p>
      ${picker('📸 Choose a photo', 'button')}
    </section>

    <section id="busy" hidden>
      <div class="big wobble">⏳</div>
      <p id="busy-text"></p>
    </section>

    <section id="preview" hidden>
      <img id="photo" alt="Your photo, cropped square">
      <button id="send" class="button">✨ Send it to Wish Jar</button>
      ${picker('Pick a different one', 'link')}
    </section>

    <section id="done" hidden>
      <div class="big">🎉</div>
      <h1>Sent!</h1>
      <p>Your photo is on Wish Jar now. You can close this page.</p>
    </section>

    <section id="oops" hidden>
      <div class="big" id="oops-emoji"></div>
      <p id="oops-text"></p>
      <button id="retry" class="button" hidden>Try again</button>
      <span id="other" hidden>${picker('📸 Choose another photo', 'button')}</span>
    </section>

    <script>
      const code = ${JSON.stringify(code)};
      const SIZE = 512;
      const MAX_BYTES = 300 * 1024;
      let photo = null;

      function show(id) {
        for (const section of document.querySelectorAll('section')) section.hidden = section.id !== id;
      }
      function busy(text) {
        document.getElementById('busy-text').textContent = text;
        show('busy');
      }
      // next: 'retry' sends the same photo again, 'other' picks another one.
      function oops(emoji, text, next) {
        document.getElementById('oops-emoji').textContent = emoji;
        document.getElementById('oops-text').textContent = text;
        document.getElementById('retry').hidden = next !== 'retry';
        document.getElementById('other').hidden = next !== 'other';
        show('oops');
      }

      // Cropped square from the middle and shrunk to 512 px here on the phone,
      // so only a small JPEG travels (browsers draw the photo upright).
      async function squareJpeg(file) {
        const url = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const width = image.naturalWidth;
          const height = image.naturalHeight;
          const side = Math.min(width, height);
          const size = Math.min(SIZE, side);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          canvas
            .getContext('2d')
            .drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);
          for (const quality of [0.8, 0.6, 0.4]) {
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
            if (blob && blob.size <= MAX_BYTES) return blob;
          }
          throw new Error('Too big');
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      async function choose(input) {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        busy('Getting your photo ready…');
        try {
          photo = await squareJpeg(file);
        } catch {
          return oops('😕', "We couldn't open that photo. Try a different one?", 'other');
        }
        const preview = document.getElementById('photo');
        if (preview.src) URL.revokeObjectURL(preview.src);
        preview.src = URL.createObjectURL(photo);
        show('preview');
      }

      async function send() {
        busy('Sending your photo…');
        let response;
        try {
          response = await fetch('/s/' + code + '/photo', {
            method: 'POST',
            headers: { 'Content-Type': 'image/jpeg' },
            body: photo,
          });
        } catch {
          return oops('📶', "Couldn't reach Wish Jar. Check your internet, then try again.", 'retry');
        }
        if (response.ok) return show('done');
        if (response.status === 410) {
          return oops('⏰', 'This code has run out. Ask Wish Jar for a new one and scan it again.');
        }
        if (response.status === 409) {
          return oops('🎉', 'A photo was already sent with this code. Ask Wish Jar for a new code to send another.');
        }
        if (response.status === 429) {
          return oops('⏳', 'Lots of photos have been sent from this internet connection just now. Wait a few minutes, then try again.', 'retry');
        }
        if (response.status === 413 || response.status === 415) {
          return oops('😕', "That photo didn't work. Try a different one?", 'other');
        }
        oops('😕', 'Something went wrong. Try again in a moment.', 'retry');
      }

      for (const input of document.querySelectorAll('input[type=file]')) {
        input.addEventListener('change', () => choose(input));
      }
      document.getElementById('send').addEventListener('click', send);
      document.getElementById('retry').addEventListener('click', send);
    </script>
  `);
}

function codeForm(): string {
  return `
    <form action="/s" method="get">
      <input name="code" placeholder="K7P 4XM" maxlength="8" autocomplete="off"
        autocapitalize="characters" spellcheck="false" aria-label="Code" required>
      <button class="button">Next</button>
    </form>
  `;
}

function layout(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Send a photo to Wish Jar</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: #FFF8F0;
    color: #3D2C2E;
    font: 18px/1.45 ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  main {
    width: 100%;
    max-width: 440px;
    margin: 24px 16px;
    padding: 28px 22px;
    background: #fff;
    border-radius: 28px;
    box-shadow: 0 6px 0 #FFE3CC;
    text-align: center;
  }
  h1 { font-size: 26px; line-height: 1.2; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  section { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  [hidden] { display: none !important; }
  .big { font-size: 64px; line-height: 1; margin-bottom: 12px; }
  .wobble { animation: wobble 0.8s ease-in-out infinite alternate; }
  @keyframes wobble { from { transform: rotate(-12deg); } to { transform: rotate(12deg); } }
  .code { color: #8A7A7C; }
  .code b { color: #3D2C2E; letter-spacing: 0.12em; }
  .warn { color: #D96A1E; }
  .button {
    display: inline-block;
    min-width: 220px;
    margin: 4px 0 12px;
    padding: 16px 24px;
    border: 0;
    border-radius: 999px;
    background: #FF8A3D;
    box-shadow: 0 4px 0 #D96A1E;
    color: #fff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .button:active { transform: translateY(3px); box-shadow: 0 1px 0 #D96A1E; }
  .link { color: #D96A1E; font-weight: 600; text-decoration: underline; cursor: pointer; padding: 8px; }
  #photo { width: 240px; height: 240px; border-radius: 24px; margin-bottom: 16px; background: #FFE3CC; }
  form { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  input[name=code] {
    width: 220px;
    padding: 14px;
    border: 3px solid #FFE3CC;
    border-radius: 18px;
    color: inherit;
    font: inherit;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-align: center;
    text-transform: uppercase;
  }
  input[name=code]:focus { outline: none; border-color: #FF8A3D; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
