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

```bash
pnpm install
pnpm start        # start the dev server
pnpm ios          # run on iOS
pnpm android      # run on Android
pnpm web          # run on web
```

When the machine is on [Tailscale](https://tailscale.com/), the dev server
uses its Tailscale address, so the QR code works from a phone on the same
tailnet even when the machine is a VM. Set `REACT_NATIVE_PACKAGER_HOSTNAME`
to choose another address.

The family jar lives in the relay, a Cloudflare Worker in `relay/`. Starting
a family needs a Turnstile check: [relay/README.md](./relay/README.md) says how
to make the widget and give the Worker its secret key, and how to run both
locally.

See [AGENTS.md](./AGENTS.md) for project conventions and commands.

## Frameo photo frame

Wish Jar can also run full screen on a Frameo photo frame. See
[frame/README.md](./frame/README.md).
