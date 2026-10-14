// Starts the Expo dev server on this machine's Tailscale address, so a phone
// on the same tailnet can open the QR code even when the machine is a VM its
// LAN address can't reach. Without Tailscale, Expo picks its usual address.
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function tailscaleAddress() {
  try {
    const output = execFileSync('tailscale', ['ip', '-4'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    });
    return output.split('\n')[0].trim() || null;
  } catch {
    return null;
  }
}

const env = { ...process.env };
if (!env.REACT_NATIVE_PACKAGER_HOSTNAME) {
  const address = tailscaleAddress();
  if (address) {
    // Undocumented, but the only way to choose the host Expo puts in the QR code.
    env.REACT_NATIVE_PACKAGER_HOSTNAME = address;
    console.log(`Serving on Tailscale address ${address}`);
  }
}

const child = spawn(
  process.execPath,
  [require.resolve('expo/bin/cli'), 'start', ...process.argv.slice(2)],
  { stdio: 'inherit', env },
);
// Pass stop signals on, so a stopped script never leaves the dev server running.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
