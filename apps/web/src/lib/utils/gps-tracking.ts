import type { GpsDataRow, GpsDataWithVehicle } from '@/lib/api/gps';
import type { TrackerDevice } from '@/lib/api/tracker-devices';
import { DEVICE_ONLINE_THRESHOLD_MS } from './tracker-devices';

export interface TrackingVehicle {
  id: string;
  plate: string;
  description: string;
  point?: GpsDataWithVehicle;
  tracker?: TrackerDevice;
}

export function vehicleConnection(
  vehicle: TrackingVehicle,
  now: number,
  registryUnavailable: boolean
): 'online' | 'offline' | 'unknown' {
  // A position receipt proves contact even while the gateway's lookup is cached.
  if (
    hasGpsPosition(vehicle.point) &&
    isRecentReport(vehicle.point?.created_at, now)
  )
    return 'online';
  if (registryUnavailable || !vehicle.tracker) return 'unknown';
  return isRecentReport(vehicle.tracker.lastSeenAt, now) ? 'online' : 'offline';
}

export function hasGpsPosition(
  point: Pick<GpsDataRow, 'latitude' | 'longitude'> | null | undefined
): boolean {
  return (
    !!point &&
    point.latitude !== null &&
    point.longitude !== null &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

export function isRecentReport(
  time: string | null | undefined,
  now: number
): boolean {
  const date = time ? Date.parse(time) : NaN;
  return (
    Number.isFinite(date) &&
    date <= now + 60_000 &&
    now - date < DEVICE_ONLINE_THRESHOLD_MS
  );
}

export function reportAge(
  time: string | null | undefined,
  now: number
): string {
  if (!time || !Number.isFinite(Date.parse(time))) return 'Unknown';
  const seconds = Math.max(0, Math.floor((now - Date.parse(time)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Invalid reports and long gaps break a line rather than inventing coverage.
export function routeSegments(points: GpsDataRow[]): [number, number][][] {
  const segments: [number, number][][] = [];
  let segment: [number, number][] = [];
  let previousTime: number | null = null;
  const flush = () => {
    if (segment.length) segments.push(segment);
    segment = [];
  };
  for (const point of points) {
    const time = Date.parse(point.created_at);
    if (!hasGpsPosition(point) || !Number.isFinite(time)) {
      flush();
      previousTime = null;
      continue;
    }
    if (
      previousTime !== null &&
      (time - previousTime > 5 * 60_000 || time < previousTime)
    )
      flush();
    segment.push([point.latitude!, point.longitude!]);
    previousTime = time;
  }
  flush();
  return segments;
}
