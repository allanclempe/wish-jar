import { getAlexaLaunch } from '../device/alexa';
import { onEchoShow } from '../device/host';
import { deviceLabel } from '../device/label';
import { addStarterTasks } from '../tasks/starter';
import { loadDevice, saveDevice, type DeviceState } from './device';
import { firstLaunchDone, guardFirstLaunch } from './firstLaunch';
import {
  createFamily,
  createJarClient,
  type EchoShowRequest,
  JarCallError,
  joinFamily,
  linkEchoShow,
  rejoinEchoShow,
  signToken,
} from './jar';
import { listKids } from './kids';
import { readLocalJar } from './localJar';

// The token of this device's family, or null when it has none yet: then the
// device starts a family (startFamilyJar) or joins one (joinFamilyJar), as
// the person setting it up chooses.
//
// The Echo Show loses its token at the end of every skill session (WJ-45), so
// with none it asks the API for a new one with its Alexa device id and the
// secret the skill keeps for it (WJ-60). Null when the API doesn't have the
// Show in a family, or the skill didn't send the id; an API that can't be
// reached throws, for the reconnecting screen, so the Show never starts a
// family of its own by mistake.
export async function openFamilyJar(): Promise<string | null> {
  const device = await loadDevice();
  if (device.token) {
    const token = await withSignature(device, device.token);
    // A link that didn't go through earlier in this session.
    void linkThisEchoShow(token);
    return token;
  }
  const show = await thisEchoShow();
  if (!show) return null;
  const rejoined = await rejoinEchoShow(show);
  if (!rejoined) return null;
  await saveDevice({ token: rejoined.token, activeKidId: null });
  markLinked(rejoined.token);
  return rejoined.token;
}

// A token from before WJ-55 has no signature, and the API takes it only
// until a cut-off date (apps/api/src/signing.ts): it's swapped here for this
// device's signed token, kept from then on. Tried at every launch until it
// works, with a short timeout (signToken); meanwhile the old token still opens
// the jar.
async function withSignature(device: DeviceState, token: string): Promise<string> {
  if (token.split('.').length !== 2) return token;
  try {
    const signed = await signToken(token);
    await saveDevice({ ...device, token: signed.token });
    return signed.token;
  } catch {
    return token;
  }
}

// What the setup screen tells the person setting up an Echo Show, once
// openFamilyJar has looked for its family: whether it will find the family by
// itself next time. Null on other devices.
export function echoShowSetupNote(): string | null {
  if (!onEchoShow || knownEchoShow === undefined) return null;
  return knownEchoShow
    ? 'Once this Echo Show is in a family jar, it finds it again by itself each time Wish Jar opens.'
    : "This Echo Show can't tell Wish Jar which device it is (the Alexa skill needs an update), so it forgets its family jar when the skill closes. Join the jar with a code each time.";
}

// undefined until asked; null when the skill sent no id or Alexa didn't
// answer, which a retry in the same page wouldn't change.
let knownEchoShow: EchoShowRequest | null | undefined;

// The API turns away an id or a secret shorter than 32 characters, or
// longer than 512 (apps/api/src/echoShow.ts). Without both the Show can't rejoin,
// so it's treated as one that can't tell which device it is.
function fits(value: string | null): value is string {
  return value != null && value.length >= 32 && value.length <= 512;
}

async function thisEchoShow(): Promise<EchoShowRequest | null> {
  if (!onEchoShow) return null;
  if (knownEchoShow === undefined) {
    const launch = await getAlexaLaunch().catch(() => null);
    if (!launch || !fits(launch.deviceId) || !fits(launch.secret)) knownEchoShow = null;
    else knownEchoShow = { alexaDeviceId: launch.deviceId, showSecret: launch.secret };
  }
  return knownEchoShow;
}

// The token whose device row the API has linked to this Echo Show, kept for
// the skill session so a reload doesn't link again.
const LINKED_KEY = 'wish-jar:echo-show-linked';
const LINK_RETRY_MS = 10_000;

function markLinked(token: string): void {
  try {
    sessionStorage.setItem(LINKED_KEY, token);
  } catch {
    // A reload links again, which does no harm.
  }
}

function linkedToken(): string | null {
  try {
    return sessionStorage.getItem(LINKED_KEY);
  } catch {
    return null;
  }
}

// After the Echo Show starts or joins a family: lets it rejoin that family at
// its next launches. The first try is waited for; while the API can't be
// reached it keeps trying in the background, as an unlinked Show would come
// back next time to the setup screen and a family of its own.
async function linkThisEchoShow(token: string): Promise<void> {
  const show = await thisEchoShow();
  if (!show || linkedToken() === token) return;
  const attempt = async (): Promise<boolean> => {
    try {
      await linkEchoShow(token, show);
      markLinked(token);
      return true;
    } catch (error) {
      // Anything but a lost connection (the device was removed meanwhile)
      // won't go better next time.
      return !(error instanceof JarCallError && error.lost);
    }
  };
  if (await attempt()) return;
  const retry = async () => {
    // Not once the Show has moved on to another family.
    if ((await loadDevice()).token !== token) return;
    if (!(await attempt())) setTimeout(() => void retry(), LINK_RETRY_MS);
  };
  setTimeout(() => void retry(), LINK_RETRY_MS);
}

// Makes a new family with this device as its first. The jar this device kept
// before (localJar.ts) goes up with it, and stays on the device untouched;
// the device only switches to the family jar once the token is kept, so a
// failure anywhere leaves it as it was, to try again. A device that had no jar
// gets a fresh family with the starter tasks. `turnstileToken` is from the
// Turnstile check on the setup screen (WJ-54); it works once.
export async function startFamilyJar(turnstileToken: string): Promise<string> {
  const device = await loadDevice();
  if (device.token) return device.token;

  return guardFirstLaunch(async () => {
    // Another tab may have made the family while this one waited.
    const latest = await loadDevice();
    if (latest.token) return latest.token;

    const local = await readLocalJar();
    if (local) {
      const { token } = await createFamily(deviceLabel(), turnstileToken, local.jar);
      await saveDevice({ token, activeKidId: local.activeKidId });
      firstLaunchDone();
      await linkThisEchoShow(token);
      return token;
    }

    // The starter tasks go in before the token is kept: a family left
    // half-filled by a lost connection is never opened again, and the next
    // try starts a whole new one rather than adding the list twice.
    const { token } = await createFamily(deviceLabel(), turnstileToken);
    await addStarterTasks(createJarClient(token));
    await saveDevice({ token, activeKidId: null });
    firstLaunchDone();
    await linkThisEchoShow(token);
    return token;
  });
}

// Joins the family whose code was typed (WJ-48), with a token of this
// device's own. Whatever jar this device had before stays behind: the jar it
// kept on the device (never uploaded), or the family jar it was in, whose
// token is dropped here. Nothing is merged. An Echo Show rejoins this family
// from now on (WJ-45). The family's first kid starts out picked, so the device
// opens on their tasks rather than the welcome screen.
export async function joinFamilyJar(code: string): Promise<string> {
  const { token } = await joinFamily(code, deviceLabel());
  const kids = await listKids(createJarClient(token)).catch(() => []);
  await saveDevice({ token, activeKidId: kids[0]?.id ?? null });
  firstLaunchDone();
  await linkThisEchoShow(token);
  return token;
}
