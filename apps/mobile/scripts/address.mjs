// The address a phone opens the dev server at: this machine's Tailscale
// address, so a phone on the same tailnet can reach it even when the machine
// is a VM its LAN address can't reach. `pnpm dev` (scripts/dev.mjs at the
// repository's root) falls back to the LAN address, so the local API is on the
// same one as the dev server.
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';

export function tailscaleAddress() {
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

export function lanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}
