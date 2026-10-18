// The calendar day on the device clock, e.g. "2026-10-11". Ticks are kept per
// day, so a new day key means every task starts unticked again.
export function dayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
