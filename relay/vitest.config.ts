import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

import { TEST_SECRET_KEY } from './test/turnstileKeys';

// Runs the Worker and its Durable Objects in workerd locally: no Cloudflare
// account needed. The Turnstile secret is Cloudflare's test key (WJ-54);
// test/setup.ts answers for Cloudflare's siteverify.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { TURNSTILE_SECRET_KEY: TEST_SECRET_KEY } },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
});
