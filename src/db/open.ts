import { addStarterTasks } from '../tasks/starter';
import { loadDevice, saveDevice } from './device';
import { firstLaunchDone, guardFirstLaunch } from './firstLaunch';
import { createFamily, createJarClient } from './jar';
import { readLocalJar } from './localJar';

// The token of this device's family, making the family first when the device
// has none yet. The jar this device kept before (localJar.ts) goes up with it,
// and stays on the device untouched; the device only switches to the family
// jar once the token is kept, so a failure anywhere leaves it as it was, to
// try again. A device that had no jar gets a fresh family with the starter
// tasks.
export async function openFamilyJar(): Promise<string> {
  const device = await loadDevice();
  if (device.token) return device.token;

  return guardFirstLaunch(async () => {
    // Another tab may have made the family while this one waited.
    const latest = await loadDevice();
    if (latest.token) return latest.token;

    const local = await readLocalJar();
    if (local) {
      const { token } = await createFamily(local.jar);
      await saveDevice({ token, activeKidId: local.activeKidId });
      firstLaunchDone();
      return token;
    }

    // The starter tasks go in before the token is kept: a family left
    // half-filled by a lost connection is never opened again, and the next
    // try starts a whole new one rather than adding the list twice.
    const { token } = await createFamily();
    await addStarterTasks(createJarClient(token));
    await saveDevice({ token, activeKidId: null });
    firstLaunchDone();
    return token;
  });
}
