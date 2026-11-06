// src/lib/api/gps.ts
import { api, apiRequest } from './client.js';

// FE-facing shape (mirrors the pre-cutover Supabase gps type so
// consumers like VehicleMap/useLatestGpsData are unaffected): snake_case,
// with the vehicle summary nested under `vehicles`. GET /gps/latest returns
// a FLAT camelCase row (joined, no trip); this adapter nests it.
export interface GpsDataWithVehicle {
  gps_id: string;
  vehicle_id: string | null;
  trip_id: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  engine_status: string | null;
  created_at: string;
  vehicles?: {
    id: string;
    make: string;
    model: string;
    license_plate: string;
    status: string;
    mileage: number;
    fuel_type: string;
  } | null;
}

// A bare GPS point with no vehicle join (matches what GET /gps/history returns).
export type GpsDataRow = Omit<GpsDataWithVehicle, 'vehicles'>;

// GET /gps/latest row (apps/api/src/modules/gps/repository.ts latestPerVehicle
// -- raw SQL, camelCase-aliased, includes the joined vehicle summary).
interface GpsLatestApiRow {
  id: string;
  vehicleId: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  engineStatus: string | null;
  createdAt: string;
  make: string;
  model: string;
  licensePlate: string;
  status: string;
  mileage: number;
  fuelType: string;
}

// GET /gps/history row (bare Prisma GpsData row, no vehicle join).
interface GpsHistoryApiRow {
  id: string;
  vehicleId: string | null;
  tripId: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  engineStatus: string | null;
  createdAt: string;
}

// Nest a flat /gps/latest row into the FE's snake_case + nested `vehicles` shape.
function toNested(row: GpsLatestApiRow): GpsDataWithVehicle {
  return {
    gps_id: row.id,
    vehicle_id: row.vehicleId,
    trip_id: null, // not selected by /gps/latest (no trip join)
    latitude: row.latitude,
    longitude: row.longitude,
    speed: row.speed,
    heading: row.heading,
    engine_status: row.engineStatus,
    created_at: row.createdAt,
    vehicles: {
      id: row.vehicleId,
      make: row.make,
      model: row.model,
      license_plate: row.licensePlate,
      status: row.status,
      mileage: row.mileage,
      fuel_type: row.fuelType
    }
  };
}

// Reshape a bare /gps/history row into the FE's snake_case shape.
function toRow(row: GpsHistoryApiRow): GpsDataRow {
  return {
    gps_id: row.id,
    vehicle_id: row.vehicleId,
    trip_id: row.tripId,
    latitude: row.latitude,
    longitude: row.longitude,
    speed: row.speed,
    heading: row.heading,
    engine_status: row.engineStatus,
    created_at: row.createdAt
  };
}

// Fetch the newest GPS point per vehicle, embedding a vehicle summary (used
// by the live tracking map; polled every 5s by useLatestGpsData).
export async function getLatestGpsData(): Promise<GpsDataWithVehicle[]> {
  const res = await api.get<{ data: GpsLatestApiRow[]; count: number }>(
    '/gps/latest'
  );
  return res.data.map(toNested);
}

// Fetch up to 100 of the most recent GPS points for a single vehicle.
export async function getGpsDataByVehicle(
  vehicleId: string
): Promise<GpsDataRow[]> {
  const res = await api.get<{ data: GpsHistoryApiRow[]; count: number }>(
    '/gps/history',
    {
      vehicleId,
      limit: 100
    }
  );
  return res.data.map(toRow);
}

export interface GpsRouteRange {
  vehicleId: string;
  from: string;
  to: string;
}

export interface GpsRouteHistory {
  points: GpsDataRow[];
  count: number;
}

// The fixed time range prevents live inserts from moving the end of a paged route.
export async function getGpsRouteHistory(
  range: GpsRouteRange,
  signal?: AbortSignal
): Promise<GpsRouteHistory> {
  const points = new Map<string, GpsDataRow>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let count = 0;
  do {
    signal?.throwIfAborted();
    const page = await apiRequest<{
      data: GpsHistoryApiRow[];
      count: number;
      nextCursor: string | null;
    }>('/gps/history', {
      query: { ...range, limit: 5000, cursor },
      signal
    });
    count = page.count;
    for (const row of page.data) points.set(row.id, toRow(row));
    if (points.size > 100_000)
      throw new Error(
        'Too many reports in this period. Choose a shorter range.'
      );
    if (page.nextCursor && (cursors.has(page.nextCursor) || !page.data.length))
      throw new Error(
        'The route could not be loaded completely. Try a shorter period.'
      );
    cursor = page.nextCursor ?? undefined;
    if (cursor) cursors.add(cursor);
  } while (cursor);
  if (points.size < count)
    throw new Error(
      'The route could not be loaded completely. Try a shorter period.'
    );
  return {
    points: [...points.values()].sort(
      (a, b) =>
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        a.gps_id.localeCompare(b.gps_id)
    ),
    count
  };
}
