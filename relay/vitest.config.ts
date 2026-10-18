import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

import { TEST_PURGE_TOKEN, TEST_PURGE_ZONE } from './test/purgeKeys';
import { TEST_SIGNING_KEY } from './test/signingKey';
import { TEST_SECRET_KEY } from './test/turnstileKeys';

// Runs the Worker and its Durable Objects in workerd locally: no Cloudflare
// account needed. The Turnstile secret is Cloudflare's test key (WJ-54);
// test/setup.ts answers for Cloudflare's siteverify. Tokens and photo URLs
// are signed with a fixed test key (WJ-55). Deleted photos are purged with a
// made-up token and zone (WJ-59), and test/setup.ts answers for the purge API.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TURNSTILE_SECRET_KEY: TEST_SECRET_KEY,
          SIGNING_KEY: TEST_SIGNING_KEY,
          CACHE_PURGE_TOKEN: TEST_PURGE_TOKEN,
          CACHE_PURGE_ZONE_ID: TEST_PURGE_ZONE,
        },
      },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
});
