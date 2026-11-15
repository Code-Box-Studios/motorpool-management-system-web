import { Prisma, type GpsData } from '@prisma/client';
import type { GpsHistoryQuery, IngestGpsBody } from '@mms/shared';
import { prisma } from '../../lib/prisma.js';
import { lockVehicles } from '../../lib/resource-locks.js';
import { AppError } from '../../lib/errors.js';
import { persistPacketLog } from './packet-logs.js';

// Insert the point and update the vehicle's denormalized latest position, atomically.
export async function ingest(body: IngestGpsBody) {
  const receivedAt = new Date();
  const fixTime =
    body.fixTime ??
    (body.packet?.fixTime ? new Date(body.packet.fixTime) : null) ??
    (body.packet ? new Date(body.packet.receivedAt) : body.receivedAt) ??
    receivedAt;
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
        data: {
          lastSeenAt: new Date(
            Math.max(receivedAt.getTime(), device.lastSeenAt?.getTime() ?? 0)
          )
        }
      });
    }
    // The identity-free contract is retained for trusted, device-key-authenticated
    // direct integrations. H02 gateway packets always take the identity path.
    // Both identified and direct integrations serialize by vehicle. Acquire this
    // before inserting a point, so concurrent commits see one event-time winner.
    await lockVehicles(tx, [vehicleId]);
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { lastLocationUpdate: true }
    });
    const point = await tx.gpsData.create({
      data: {
        ...(body.packet ? { id: body.packet.id } : {}),
        vehicleId,
        fixTime,
        createdAt: receivedAt,
        tripId: body.tripId ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        speed: body.speed ?? null,
        heading: body.heading ?? null,
        engineStatus: body.engineStatus ?? null
      }
    });
    const [latest] = await tx.$queryRaw<{ id: string }[]>`
      SELECT gps_id AS id FROM gps_data WHERE vehicle_id = ${vehicleId}::uuid
      ORDER BY COALESCE(fix_time, created_at) DESC, created_at DESC, gps_id DESC LIMIT 1
    `;
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...(latest?.id === point.id
          ? { latitude: body.latitude, longitude: body.longitude }
          : {}),
        // A delayed measurement still proves a recent receipt, without making
        // the older coordinates the current position or rewinding contact time.
        lastLocationUpdate: new Date(
          Math.max(
            receivedAt.getTime(),
            vehicle.lastLocationUpdate?.getTime() ?? 0
          )
        )
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
// Prisma query builder, so raw SQL uses the additive effective-event-time index.
// Null fix times retain the legacy receipt-time ordering. snake_case columns; joined vehicle summary.
export interface LatestGpsRow {
  id: string;
  vehicleId: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  engineStatus: string | null;
  createdAt: Date;
  fixTime: Date | null;
  lastContactAt: Date;
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
      g.fix_time AS "fixTime", COALESCE(v.last_location_update, g.created_at) AS "lastContactAt",
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
    ORDER BY g.vehicle_id, COALESCE(g.fix_time, g.created_at) DESC, g.created_at DESC, g.gps_id DESC
  `;
}

export async function history(query: GpsHistoryQuery) {
  const conditions = [Prisma.sql`vehicle_id = ${query.vehicleId}::uuid`];
  if (query.tripId)
    conditions.push(Prisma.sql`trip_id = ${query.tripId}::uuid`);
  if (query.from)
    conditions.push(
      Prisma.sql`COALESCE(fix_time, created_at) >= ${query.from}`
    );
  if (query.to)
    conditions.push(Prisma.sql`COALESCE(fix_time, created_at) <= ${query.to}`);
  const where = Prisma.join(conditions, ' AND ');
  const [totals, anchors] = await Promise.all([
    prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT COUNT(*) AS count FROM gps_data WHERE ${where}`,
    query.cursor
      ? prisma.$queryRaw<{ eventTime: Date; createdAt: Date; id: string }[]>`
          SELECT COALESCE(fix_time, created_at) AS "eventTime", created_at AS "createdAt", gps_id AS id
          FROM gps_data WHERE ${where} AND gps_id = ${query.cursor}::uuid
        `
      : Promise.resolve([])
  ]);
  const count = Number(totals[0]?.count ?? 0);
  // A foreign, removed or out-of-range cursor cannot anchor another journey.
  if (query.cursor && !anchors[0]) return { data: [], count, nextCursor: null };
  const anchor = anchors[0];
  const after = anchor
    ? Prisma.sql`AND (COALESCE(fix_time, created_at), created_at, gps_id)
        < (${anchor.eventTime}, ${anchor.createdAt}, ${anchor.id}::uuid)`
    : Prisma.empty;
  // Measurement time drives filtering AND pagination. Keep receipt time as a
  // legacy fallback and deterministic tie-breaker, without rewriting history.
  const data = await prisma.$queryRaw<GpsData[]>`
    SELECT gps_id AS id, vehicle_id AS "vehicleId", trip_id AS "tripId",
      latitude, longitude, speed, heading, engine_status AS "engineStatus",
      created_at AS "createdAt", updated_at AS "updatedAt", fix_time AS "fixTime"
    FROM gps_data WHERE ${where} ${after}
    ORDER BY COALESCE(fix_time, created_at) DESC, created_at DESC, gps_id DESC
    LIMIT ${query.limit + 1}
  `;
  const more = data.length > query.limit;
  const page = more ? data.slice(0, query.limit) : data;
  return { data: page, count, nextCursor: more ? page.at(-1)!.id : null };
}
