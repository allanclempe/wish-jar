# Wish Jar

A mobile app for kids to earn their wishes by completing daily tasks.

## The idea

Kids get a list of daily tasks — brush your teeth, make the bed, and so on. Each
task has an amount attached to it. Every time a kid completes a task they tick it
off and put some cash toward their wishes.

## Features

- **Daily tasks** — a checklist the kids tick off as they complete each one.
- **Rewards** — each task is worth an amount that goes toward the kid's savings.
- **Wish list** — the kids add their wishes, and parents put an amount against
  each one.
- **Progress** — a visual indicator (like a progress bar) shows how close they
  are to each wish as they complete more activities.

## Getting started

This is an [Expo](https://docs.expo.dev/) / React Native app using
[Expo Router](https://docs.expo.dev/router/introduction.md).

It's a pnpm workspace: the app is in `apps/mobile`, and these run from the
repository's root.

```bash
pnpm install
pnpm dev          # the dev server and the API, locally
pnpm start        # the dev server only, with the deployed API
pnpm ios          # run on iOS
pnpm android      # run on Android
pnpm web          # run on web
```

When the machine is on [Tailscale](https://tailscale.com/), the dev server
uses its Tailscale address, so the QR code works from a phone on the same
tailnet even when the machine is a VM. Set `REACT_NATIVE_PACKAGER_HOSTNAME`
to choose another address.

The family jar lives in the API, a Cloudflare Worker in `apps/api`. The
jar's types, shared by the app and the API, are in `packages/jar`. Starting a
family needs a Turnstile check, which a dev build passes only against a local
API: the deployed one turns away the test widget's token. So develop with
`pnpm dev`, which runs the API locally with Cloudflare's test secret and points
the app at it. Both are on the same address as the QR code, so a phone can
reach them, and arguments go on to Expo (`pnpm dev --web`).
[apps/api/README.md](./apps/api/README.md) says how to make the widget and
give the deployed Worker its secret key.

See [AGENTS.md](./AGENTS.md) for project conventions and commands.

## Frameo photo frame

Wish Jar can also run full screen on a Frameo photo frame. See
[apps/frame/README.md](./apps/frame/README.md).
