// src/lib/api/gps.ts
import { api, apiRequest, ApiError } from './client.js';

// FE-facing shape (mirrors the pre-cutover lib/supabase/gps.ts type so
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
  const res = await api.get<{ data: GpsLatestApiRow[]; count: number }>('/gps/latest');
  return res.data.map(toNested);
}

// Fetch up to 100 of the most recent GPS points for a single vehicle.
export async function getGpsDataByVehicle(vehicleId: string): Promise<GpsDataRow[]> {
  const res = await api.get<{ data: GpsHistoryApiRow[]; count: number }>('/gps/history', {
    vehicleId,
    limit: 100
  });
  return res.data.map(toRow);
}

// Outgoing demo ingest body (camelCase, matches the API's ingestGpsBodySchema).
export interface GpsIngestInput {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  engineStatus?: string | null;
}

interface GpsIngestResult {
  success: boolean;
  gpsId: string;
}

// Simulate a device GPS ping for the dashboard demo. This endpoint uses
// device-key auth (NOT the user's JWT) -- see require-device-key.ts -- so the
// device key is sent as an explicit header instead of relying on the client's
// bearer-token auth.
export async function insertGpsData(gpsData: GpsIngestInput): Promise<GpsIngestResult> {
  const deviceKey = import.meta.env.VITE_GPS_DEVICE_KEY as string | undefined;
  // Fail fast (and clearly) on a misconfigured demo rather than firing a doomed
  // request that the API rejects with a device-key 401.
  if (!deviceKey) {
    throw new ApiError(0, 'GPS_DEVICE_KEY_MISSING', 'VITE_GPS_DEVICE_KEY is not set — the GPS demo needs a device key.');
  }
  return apiRequest<GpsIngestResult>('/gps/ingest', {
    method: 'POST',
    json: gpsData,
    // This endpoint uses device-key auth, NOT the user's JWT. A 401 here means a
    // bad/absent device key — it must NOT trigger the client's JWT refresh (and
    // its logout-on-failure path), which would kick out a validly logged-in user.
    skipRefresh: true,
    headers: { 'x-device-api-key': deviceKey }
  });
}
