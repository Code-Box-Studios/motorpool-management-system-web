import type { Prisma } from '@prisma/client';
import type { IngestGpsBody } from '@mms/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { persistPacketLog } from './packet-logs.js';

// Insert the point and update the vehicle's denormalized latest position, atomically.
export async function ingest(body: IngestGpsBody) {
  return prisma.$transaction(async (tx) => {
    let vehicleId = body.vehicleId;
    if (body.deviceId) {
      // Tracker edits/deletion take this same row lock. Re-read AFTER waiting:
      // cached gateway vehicle IDs are hints, never assignment authority.
      await tx.$queryRaw`SELECT id FROM tracker_devices WHERE imei = ${body.deviceId} FOR UPDATE`;
      if (body.packet) {
        const prior = await tx.gpsData.findUnique({
          where: { id: body.packet.id }
        });
        if (prior) {
          const receipt = await tx.trackerPacketLog.findUnique({
            where: { id: body.packet.id }
          });
          if (
            !receipt ||
            receipt.revision !== 1 ||
            receipt.outcome !== 'saved'
          ) {
            throw new AppError(
              409,
              'PACKET_IDENTITY_CONFLICT',
              'Packet has no matching saved position receipt'
            );
          }
          await persistPacketLog(
            {
              ...body.packet,
              revision: 1,
              outcome: 'saved',
              vehicleId: prior.vehicleId,
              reason: null
            },
            tx
          );
          return prior; // Lost HTTP responses may be retried after reassignment.
        }
      }
      const device = await tx.trackerDevice.findUnique({
        where: { imei: body.deviceId }
      });
      if (!device || device.status !== 'active') {
        throw new AppError(
          404,
          'DEVICE_NOT_FOUND',
          'Unknown or inactive device'
        );
      }
      if (!device.vehicleId) {
        throw new AppError(
          404,
          'NO_VEHICLE_ASSIGNED',
          'Device is not assigned to a vehicle'
        );
      }
      vehicleId = device.vehicleId;
      await tx.trackerDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() }
      });
    }
    // The identity-free contract is retained for trusted, device-key-authenticated
    // direct integrations. H02 gateway packets always take the identity path.
    const point = await tx.gpsData.create({
      data: {
        ...(body.packet ? { id: body.packet.id } : {}),
        vehicleId,
        tripId: body.tripId ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        speed: body.speed ?? null,
        heading: body.heading ?? null,
        engineStatus: body.engineStatus ?? null
      }
    });
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        latitude: body.latitude,
        longitude: body.longitude,
        lastLocationUpdate: new Date()
      }
    });
    if (body.packet) {
      const logged = await persistPacketLog(
        {
          ...body.packet,
          revision: 1,
          outcome: 'saved',
          vehicleId,
          reason: null
        },
        tx
      );
      if (logged.vehicleId !== vehicleId || logged.outcome !== 'saved') {
        throw new AppError(
          409,
          'PACKET_IDENTITY_CONFLICT',
          'Packet already has a different final outcome'
        );
      }
    }
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

export async function history(
  where: Prisma.GpsDataWhereInput,
  take: number,
  cursor?: string
) {
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
