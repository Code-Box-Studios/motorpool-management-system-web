import type { Prisma } from '@prisma/client';
import type { IngestGpsBody } from '@mms/shared';
import { prisma } from '../../lib/prisma.js';

// Insert the point and update the vehicle's denormalized latest position, atomically.
export async function ingest(body: IngestGpsBody) {
  return prisma.$transaction(async (tx) => {
    const point = await tx.gpsData.create({
      data: {
        vehicleId: body.vehicleId,
        tripId: body.tripId ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        speed: body.speed ?? null,
        heading: body.heading ?? null,
        engineStatus: body.engineStatus ?? null
      }
    });
    await tx.vehicle.update({
      where: { id: body.vehicleId },
      data: {
        latitude: body.latitude,
        longitude: body.longitude,
        lastLocationUpdate: new Date()
      }
    });
    return point;
  });
}

// Newest point per vehicle (spec §10) — DISTINCT ON is not expressible in the
// Prisma query builder, so raw SQL (the @@index([vehicleId, createdAt desc])
// backs it). snake_case columns; joined vehicle summary.
export interface LatestGpsRow {
  id: string;
  vehicleId: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  engineStatus: string | null;
  createdAt: Date;
  make: string;
  model: string;
  licensePlate: string;
  status: string;
  mileage: number;
  fuelType: string;
}

export function latestPerVehicle() {
  // Alias snake_case DB columns to camelCase so /gps/latest matches the shape
  // every other endpoint (Prisma) returns — double-quoted identifiers preserve
  // case in Postgres. Unmapped columns (latitude/longitude/speed/heading/make/
  // model/status/mileage) need no alias; fuel_type has no @map on the Prisma
  // model despite the DB column being snake_case, so it needs an explicit alias.
  return prisma.$queryRaw<LatestGpsRow[]>`
    SELECT DISTINCT ON (g.vehicle_id)
      g.gps_id AS "id", g.vehicle_id AS "vehicleId", g.latitude, g.longitude,
      g.speed, g.heading, g.engine_status AS "engineStatus", g.created_at AS "createdAt",
      v.make, v.model, v.license_plate AS "licensePlate", v.status, v.mileage,
      v.fuel_type AS "fuelType"
    FROM gps_data g
    JOIN vehicles v ON v.id = g.vehicle_id
    WHERE g.vehicle_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM tracker_devices t
        WHERE t.vehicle_id = g.vehicle_id
          AND t.status = 'active'
          AND t.last_seen_at IS NOT NULL
          AND g.created_at >= t.created_at
      )
    ORDER BY g.vehicle_id, g.created_at DESC
  `;
}

export async function history(where: Prisma.GpsDataWhereInput, take: number, cursor?: string) {
  const [data, count] = await Promise.all([
    prisma.gpsData.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    }),
    prisma.gpsData.count({ where })
  ]);
  const more = data.length > take;
  const page = more ? data.slice(0, take) : data;
  return { data: page, count, nextCursor: more ? page.at(-1)!.id : null };
}
