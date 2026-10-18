// `pnpm dev`: the API (apps/api) and the Expo dev server together, with the
// app pointed at that API (WJ-73). The API runs with Cloudflare's Turnstile
// test secret, which passes the dummy token the app's test widget hands a dev
// build, so a new family can be started locally; the deployed API turns that
// token away.
//
// Both listen on one address a phone can reach: REACT_NATIVE_PACKAGER_HOSTNAME
// when it's set, else this machine's Tailscale address, else its LAN address.
// The API's photo URLs, join-code links and allowed origins follow it.
// Arguments go on to Expo (`pnpm dev --web`).
import { spawn } from 'node:child_process';
import { lanAddress, tailscaleAddress } from '../apps/mobile/scripts/address.mjs';

const API_PORT = 8787;
const expoArgs = process.argv.slice(2);
const portArg = expoArgs.findIndex((arg) => arg === '--port' || arg === '-p');
const EXPO_PORT = (portArg >= 0 && Number(expoArgs[portArg + 1])) || 8081;

const host =
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME || tailscaleAddress() || lanAddress() || 'localhost';
const apiUrl = `http://${host}:${API_PORT}`;
const appUrl = `http://${host}:${EXPO_PORT}`;
const origins = [...new Set([`http://localhost:${EXPO_PORT}`, appUrl])].join(',');

console.log(`App on ${appUrl}, API on ${apiUrl}`);

const api = spawn(
  'pnpm',
  [
    '--silent',
    '--filter',
    '@wish-jar/api',
    'dev',
    '--ip',
    '0.0.0.0',
    '--port',
    String(API_PORT),
    '--var',
    `APP_URL:${appUrl}`,
    '--var',
    `ALLOWED_ORIGINS:${origins}`,
  ],
  // Expo has the keyboard; wrangler's own shortcuts are off without it.
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DEV_HOST: host } },
);
for (const stream of [api.stdout, api.stderr]) prefixLines(stream, '[api] ');

const app = spawn('pnpm', ['--silent', '--filter', '@wish-jar/mobile', 'start', ...expoArgs], {
  stdio: 'inherit',
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: host, EXPO_PUBLIC_API_URL: apiUrl },
});

// One stopping stops the other, so neither is left running.
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of [api, app]) if (child.exitCode === null) child.kill('SIGTERM');
  process.exitCode = code;
}
api.on('exit', (code) => stop(code ?? 1));
app.on('exit', (code) => stop(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));

function prefixLines(stream, prefix) {
  let rest = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (rest + chunk).split('\n');
    rest = lines.pop();
    for (const line of lines) process.stdout.write(prefix + line + '\n');
  });
  stream.on('end', () => {
    if (rest) process.stdout.write(prefix + rest + '\n');
  });
}
