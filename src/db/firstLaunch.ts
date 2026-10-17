// Why the first launch can't go ahead yet; its message is shown on the retry
// screen as it is. Only the web has any (firstLaunch.web.ts).
export class FirstLaunchBusy extends Error {}

// One app runs at a time on a phone, so the first launch has nothing to wait
// for. The web has more to watch out for (firstLaunch.web.ts).
export function guardFirstLaunch<T>(work: () => Promise<T>): Promise<T> {
  return work();
}

export function firstLaunchDone(): void {}
