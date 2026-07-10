// A device is "online" if it reported (lastSeenAt) within this window.
// lastSeenAt is stamped server-side only by the GPS gateway /resolve ping, so
// it is the FE's liveness signal — independent of the `status` lifecycle enum.
// This is an independent front-end display heuristic only; it is NOT linked to
// the gateway's OFFLINE_AFTER_MS — the two can be reconciled later if needed.
export const DEVICE_ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// True when the device reported within DEVICE_ONLINE_THRESHOLD_MS.
export function isDeviceOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return false;
  return Date.now() - seen < DEVICE_ONLINE_THRESHOLD_MS;
}
