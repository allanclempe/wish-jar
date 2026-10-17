// What this device keeps for itself: the token that opens its family's jar,
// and the kid it shows, in localStorage (the frame's WebView has it too).
// Losing the token loses the jar for this device: there's no recovery
// (WJ-47), a second device (WJ-48) is the backup.
//
// The Echo Show's browser has no localStorage (null) and starts every skill
// session with empty storage anyway, so there the token lives only in memory
// and each session starts on the setup screen (start a jar or join one, WJ-48).
// Giving the Show a lasting place in a family is WJ-45's.
export type DeviceState = {
  // "<familyId>.<secret>" (relay/src/families.ts).
  token: string | null;
  activeKidId: number | null;
};

const TOKEN_KEY = 'wish-jar:family-token';
const ACTIVE_KID_KEY = 'wish-jar:active-kid-id';

let current: DeviceState = { token: null, activeKidId: null };

// localStorage, or null where there is none or it may not be used.
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
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

// Without localStorage the state stays in memory for this page only (see
// above). Where there is one, a failed write throws: a token that isn't kept
// is a jar lost at the next launch.
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
