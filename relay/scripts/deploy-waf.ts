import { deployWaf } from './waf';

// `pnpm run waf`: the relay's WAF rules (scripts/waf.ts), from
// .github/workflows/relay.yml with the production environment's
// CLOUDFLARE_API_TOKEN (Zone WAF: Edit on the zone) and CLOUDFLARE_ZONE_ID.
const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!zoneId || !token) {
  console.error('Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

for (const { ref, phase, done } of await deployWaf({ zoneId, token })) {
  console.log(`${ref} (${phase}): ${done}`);
}
