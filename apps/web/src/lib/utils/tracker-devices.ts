import type { Vehicle } from '@/lib/types';

// The fields any vehicle-ish row needs to be labelled (Vehicle, VehicleWithBranch).
type VehicleLabelFields = Pick<Vehicle, 'make' | 'model' | 'license_plate'>;

// Titleize a status enum value ('active' -> 'Active').
export const titleize = (s: string) => s.replace(/\b\w/g, (l) => l.toUpperCase());

// The one label a vehicle is shown under across the tracker screens.
export const vehicleLabel = (v: VehicleLabelFields) =>
  `${v.make} ${v.model} — ${v.license_plate}`;

// Read-only label for a device's assigned vehicle. A failed lookup must never
// render "Unassigned" — that's a wrong answer, not a blank one — so an assigned
// device whose vehicle we can't resolve says so explicitly.
export function assignedVehicleLabel(
  vehicleId: string | null,
  vehicle: VehicleLabelFields | undefined,
  isLoading: boolean
): string {
  if (!vehicleId) return 'Unassigned';
  if (vehicle) return vehicleLabel(vehicle);
  return isLoading ? 'Loading…' : 'Assigned (vehicle unavailable)';
}

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
