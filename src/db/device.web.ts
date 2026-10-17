// What this device keeps for itself: the token that opens its family's jar,
// and the kid it shows, in localStorage (the frame's WebView has it too).
// Losing the token loses the jar for this device: there's no recovery
// (WJ-47), a second device (WJ-48) is the backup.
//
// The Echo Show's browser has no localStorage (null) and starts every skill
// session with empty storage anyway, so there both are kept in sessionStorage,
// for reloads within the skill session. At its next launch the Show gets a new
// token from the relay with its Alexa device id (WJ-45, src/db/open.ts).
export type DeviceState = {
  // "<familyId>.<secret>.<deviceId>.<signature>" (relay/src/families.ts), or
  // "<familyId>.<secret>" from before WJ-55 until openFamilyJar swaps it.
  token: string | null;
  activeKidId: number | null;
};

const TOKEN_KEY = 'wish-jar:family-token';
const ACTIVE_KID_KEY = 'wish-jar:active-kid-id';

let current: DeviceState = { token: null, activeKidId: null };

// localStorage; sessionStorage where there's no localStorage (the Echo
// Show); null where neither may be used.
function storage(): Storage | null {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Blocked: try sessionStorage.
  }
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

// Read afresh every time, so a tab that waited for another to make the family
// sees its token.
export async function loadDevice(): Promise<DeviceState> {
  const store = storage();
  if (!store) return current;
  try {
    const kidId = Number(store.getItem(ACTIVE_KID_KEY));
    current = {
      token: store.getItem(TOKEN_KEY) ?? current.token,
      activeKidId: Number.isInteger(kidId) && kidId > 0 ? kidId : current.activeKidId,
    };
  } catch {
    // Unreadable: keep what this page already has.
  }
  return current;
}

// Without any storage the state stays in memory for this page only. Where
// there is some, a failed write throws: a token that isn't kept is a jar lost
// at the next launch.
export async function saveDevice(state: DeviceState): Promise<void> {
  current = state;
  const store = storage();
  if (!store) return;
  if (state.token) store.setItem(TOKEN_KEY, state.token);
  else store.removeItem(TOKEN_KEY);
  if (state.activeKidId != null) store.setItem(ACTIVE_KID_KEY, String(state.activeKidId));
  else store.removeItem(ACTIVE_KID_KEY);
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
