import { File, Paths } from 'expo-file-system';

// What this device keeps for itself: the token that opens its family's jar,
// and the kid it shows. In the documents directory, which the system doesn't
// clear. Losing the token loses the jar for this device: there's no recovery
// (WJ-47), a second device (WJ-48) is the backup.
export type DeviceState = {
  // "<familyId>.<secret>.<deviceId>.<signature>" (relay/src/families.ts), or
  // "<familyId>.<secret>" from before WJ-55 until openFamilyJar swaps it.
  token: string | null;
  activeKidId: number | null;
};

const deviceFile = new File(Paths.document, 'family-jar.json');

// Read once at launch, so the active kid can be read without a wait.
let current: DeviceState = { token: null, activeKidId: null };

export async function loadDevice(): Promise<DeviceState> {
  if (deviceFile.exists) {
    const saved = JSON.parse(await deviceFile.text()) as Partial<DeviceState>;
    current = {
      token: typeof saved.token === 'string' ? saved.token : null,
      activeKidId: typeof saved.activeKidId === 'number' ? saved.activeKidId : null,
    };
  }
  return current;
}

// Throws when it couldn't be written: a token that isn't kept is a jar lost
// at the next launch.
export async function saveDevice(state: DeviceState): Promise<void> {
  current = state;
  deviceFile.write(JSON.stringify(state));
}

export function loadActiveKidId(): number | null {
  return current.activeKidId;
}

// Best kept, but a kid that isn't remembered only means picking them again.
export async function saveActiveKidId(kidId: number): Promise<void> {
  try {
    await saveDevice({ ...current, activeKidId: kidId });
  } catch {
    current = { ...current, activeKidId: kidId };
  }
}
