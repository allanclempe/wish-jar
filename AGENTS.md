This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## What we're building

Wish Jar — a mobile app for kids to earn their wishes by completing daily tasks.

- Kids have a list of **daily tasks** (brush teeth, make the bed, etc.), each with
  an amount attached. Completing a task ticks it off and adds that amount to the
  kid's savings.
- Kids keep a **wish list**, and parents put an amount against each wish.
- A **progress bar** shows how close each kid is to their wishes as they complete
  more tasks.

See [README.md](./README.md) for the full description.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `apps/mobile/package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Repository layout

A pnpm workspace with one lockfile (`pnpm-workspace.yaml`, `pnpm install` at the root):

- `apps/mobile` — the Expo app (`@wish-jar/mobile`), and the site's Worker that serves its web export (`wrangler.jsonc`, `site/`).
- `apps/api` — the API (`@wish-jar/api`), the Cloudflare Worker that holds every family's jar, devices, join codes, the Echo Show link and photos. It has its own checks: `pnpm typecheck` and `pnpm test` in `apps/api`.
- `apps/frame` — the Frameo frame's kiosk app (Java, built by `build.sh`, not part of the workspace's packages).
- `packages/jar` — the jar API's types (`@wish-jar/jar`), shared by the app and the API.
- `patches/` — patched dependencies, listed in `pnpm-workspace.yaml`.

## Commands

Run these in `apps/mobile`. Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server (against the deployed API)
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

`pnpm dev` at the repository's root runs the dev server and the API locally,
with the app pointed at that API (`scripts/dev.mjs`). It's the only way a dev
build gets past the Turnstile check that starting a family needs.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `apps/mobile/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) in `apps/mobile/src/`, outside `app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Where it runs

Not on EAS Hosting any more (`wish-jar.expo.app` is retired). Both run on Cloudflare Workers and deploy from GitHub Actions on merge to main:

- **The app** (the web export, also loaded by the Echo Show and the Frameo frame): https://wish-jar.blastin.dev, from `apps/mobile/wrangler.jsonc` (`.github/workflows/site.yml`).
- **The API** (family jars, devices, photos, join codes): https://wish-jar-api.blastin.dev, from `apps/api` (`.github/workflows/api.yml`). Its Worker is still named `wish-jar-photo-relay` from when it only carried photos (WJ-72).

Build-time values such as `EXPO_PUBLIC_TURNSTILE_SITE_KEY` come from GitHub Actions variables, not from EAS.

The API is also guarded by WAF rules on the blastin.dev zone (apps/api/README.md, "The edge rules"): a rate limiting rule for the endpoints that need no token, and a custom rule that blocks every path and method the API doesn't serve. They follow the code, so keep them in step whenever you add, rename or remove an API route (`apps/api/src/routes.ts`), a path the site passes on to the API, or an endpoint that needs no token. Update the rules (`apps/api/scripts/waf.ts`), their tests and the README in the same change; they deploy with the API (`.github/workflows/api.yml`).

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Task tracking

Create and track tasks in Clocktopus for this project, not in Linear: use the
Clocktopus `create_task` tool, and the `clocktopus-start-work` skill for
branching and linking sessions.

## This is a public repository

Everything committed here (code comments, READMEs, commit messages, PR descriptions) is public. Write it with that in mind:

- Comments say what the code does and why. Don't write out how to get around a protection: no attack walkthroughs, no "this check doesn't stop X", no arithmetic for using up a shared limit.
- Don't name account-specific details: personal subdomains (such as `*.workers.dev` addresses), account or zone ids, email addresses, device ids, IP addresses.
- Never commit secrets, tokens or private keys. Public keys (like the Turnstile site key) come from build variables, not the source.
- Known weaknesses and residual risks go in the Clocktopus task, not in files.

## Rules

- If `apps/mobile/ios/` and `apps/mobile/android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `apps/mobile/app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Every change must work on the Frameo frame (Android 6, WebView 106) as well as the Echo Show: both open the deployed site (`?host=frameo`, `?host=alexa`; `apps/mobile/src/device/host.ts`), so a merge to main reaches them on their next load. No web APIs or syntax WebView 106 lacks without a fallback. See [apps/frame/README.md](./apps/frame/README.md).
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
