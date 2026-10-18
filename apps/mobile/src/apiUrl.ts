// The API (apps/api), a Cloudflare Worker: it holds every family's jar, its
// devices and photos, and carries a photo from a parent's phone. This is the
// address parents see and type on their phone.
export const API_ADDRESS = 'https://wish-jar-api.blastin.dev';

// EXPO_PUBLIC_API_URL points a dev build at another API, such as the local
// one `pnpm dev` at the repository's root runs and sets it to.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || API_ADDRESS;
