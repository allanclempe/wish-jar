// Kept out of src/index.ts, like src/codes.ts: a Worker's main module may only
// export handlers and classes.

// Deleted photos dropped from Cloudflare's edge cache in every data centre
// (WJ-59): cache.delete in a Worker only reaches the data centre it runs in.
// The zone's purge-by-URL API takes the URL the photo was cached under, its
// path without the signature (showPhoto in src/familyPhotos.ts). The Cache API
// keeps it in the zone's cache under that plain URL, with no custom cache key,
// so a purge of the same URL reaches it.
//
// CACHE_PURGE_TOKEN is an API token of its own, allowed only Zone → Cache
// Purge → Purge on the blastin.dev zone, and CACHE_PURGE_ZONE_ID that zone's
// id: both Worker secrets (README.md). Without them (`pnpm dev`, or before
// they're set) nothing is purged and a deleted photo is only forgotten in the
// data centre that deleted it. A purge that fails is logged, never thrown:
// the photo is deleted from the jar whatever the cache does.

// Up to 100 URLs a request on every plan; the Free plan takes 800 URLs a
// second for the whole account.
export const PURGE_BATCH = 100;

const PURGE_API = 'https://api.cloudflare.com/client/v4/zones';

// Optional, so `wrangler types` leaves them out of Env (only the required
// secrets are in it).
type PurgeEnv = { CACHE_PURGE_TOKEN?: string; CACHE_PURGE_ZONE_ID?: string };

type PurgeReply = { success?: boolean; errors?: { code: number; message: string }[] };

// Purges `urls` from the zone's cache in every data centre, PURGE_BATCH at a
// time. Resolves once every batch is answered, purged or not.
export async function purgeUrls(env: Env, urls: readonly string[]): Promise<void> {
  const { CACHE_PURGE_TOKEN: token, CACHE_PURGE_ZONE_ID: zone } = env as Env & PurgeEnv;
  if (!token || !zone || urls.length === 0) return;
  const batches: string[][] = [];
  for (let start = 0; start < urls.length; start += PURGE_BATCH) {
    batches.push(urls.slice(start, start + PURGE_BATCH));
  }
  await Promise.all(batches.map((files) => purgeBatch(token, zone, files)));
}

async function purgeBatch(token: string, zone: string, files: string[]): Promise<void> {
  try {
    const response = await fetch(`${PURGE_API}/${encodeURIComponent(zone)}/purge_cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
    const reply = (await response.json().catch(() => ({}))) as PurgeReply;
    if (!response.ok || !reply.success) {
      console.error('Cache purge failed', response.status, JSON.stringify(reply.errors ?? []), files.length);
    }
  } catch (error) {
    console.error('Cache purge failed', String(error), files.length);
  }
}
