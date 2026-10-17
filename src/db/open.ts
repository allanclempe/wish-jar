import { deviceLabel } from '../device/label';
import { addStarterTasks } from '../tasks/starter';
import { loadDevice, saveDevice } from './device';
import { firstLaunchDone, guardFirstLaunch } from './firstLaunch';
import { createFamily, createJarClient, joinFamily } from './jar';
import { readLocalJar } from './localJar';

// The token of this device's family, or null when it has none yet: then the
// device starts a family (startFamilyJar) or joins one (joinFamilyJar), as
// the person setting it up chooses.
export async function openFamilyJar(): Promise<string | null> {
  const device = await loadDevice();
  return device.token;
}

// Makes a new family with this device as its first. The jar this device kept
// before (localJar.ts) goes up with it, and stays on the device untouched;
// the device only switches to the family jar once the token is kept, so a
// failure anywhere leaves it as it was, to try again. A device that had no jar
// gets a fresh family with the starter tasks.
export async function startFamilyJar(): Promise<string> {
  const device = await loadDevice();
  if (device.token) return device.token;

  return guardFirstLaunch(async () => {
    // Another tab may have made the family while this one waited.
    const latest = await loadDevice();
    if (latest.token) return latest.token;

    const local = await readLocalJar();
    if (local) {
      const { token } = await createFamily(deviceLabel(), local.jar);
      await saveDevice({ token, activeKidId: local.activeKidId });
      firstLaunchDone();
      return token;
    }

    // The starter tasks go in before the token is kept: a family left
    // half-filled by a lost connection is never opened again, and the next
    // try starts a whole new one rather than adding the list twice.
    const { token } = await createFamily(deviceLabel());
    await addStarterTasks(createJarClient(token));
    await saveDevice({ token, activeKidId: null });
    firstLaunchDone();
    return token;
  });
}

// Joins the family whose code was typed (WJ-48), with a token of this
// device's own. Whatever jar this device had before stays behind: the jar it
// kept on the device (never uploaded), or the family jar it was in, whose
// token is dropped here. Nothing is merged.
export async function joinFamilyJar(code: string): Promise<string> {
  const { token } = await joinFamily(code, deviceLabel());
  await saveDevice({ token, activeKidId: null });
  firstLaunchDone();
  return token;
}
