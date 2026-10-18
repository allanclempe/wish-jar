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

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) in `src/`, outside `app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Where it runs

Not on EAS Hosting any more (`wish-jar.expo.app` is retired). Both run on Cloudflare Workers and deploy from GitHub Actions on merge to main:

- **The app** (the web export, also loaded by the Echo Show): https://wish-jar.blastin.dev, from the root `wrangler.jsonc` (`.github/workflows/site.yml`).
- **The relay** (family jars, photos, join codes): https://wish-jar-api.blastin.dev, from `relay/` (`.github/workflows/relay.yml`).

Build-time values such as `EXPO_PUBLIC_TURNSTILE_SITE_KEY` come from GitHub Actions variables, not from EAS.

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

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
