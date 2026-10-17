import type { Device, DeviceList, JoinCode } from '../../relay/src/jar/api';
import type { FamilyJar } from './jar';

export type { Device, JoinCode };

// The family's devices (WJ-48), oldest first, this one marked.
export async function listDevices(jar: FamilyJar): Promise<Device[]> {
  const { devices } = await jar.send<DeviceList>('GET', '/devices');
  return devices;
}

// Its token stops opening the jar at once. The relay refuses this device
// itself (409), so a family always keeps one.
export async function removeDevice(jar: FamilyJar, deviceId: number): Promise<void> {
  await jar.send('DELETE', `/devices/${deviceId}`);
}

// A one-time code another device types to join the family, for 10 minutes.
export function createJoinCode(jar: FamilyJar): Promise<JoinCode> {
  return jar.send<JoinCode>('POST', '/devices/codes');
}

// Lets the relay drop a code nobody will use now. Best effort: it runs out by
// itself anyway.
export function closeJoinCode(jar: FamilyJar, code: string): void {
  jar.send('DELETE', `/devices/codes/${code}`).catch(() => {});
}
