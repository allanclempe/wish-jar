// qrcode-generator by Kazuhiko Arase, MIT licence, bundled into the Worker.
import qrcode from 'qrcode-generator';

// The QR code for `text` as an SVG: one path of dark squares inside the
// four-square quiet zone scanners need, scaling to whatever size it's shown at.
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#3D2C2E"/></svg>`
  );
}
