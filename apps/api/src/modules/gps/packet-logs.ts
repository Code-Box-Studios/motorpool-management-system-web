import { Prisma, type TrackerPacketLog as PacketRow } from '@prisma/client';
import {
  trackerPacketQuerySchema,
  type TrackerPacketBody,
  type TrackerPacketLog,
  type TrackerPacketPage,
  type TrackerPacketQuery
} from '@mms/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

function serialize(row: PacketRow): TrackerPacketLog {
  return {
    ...row,
    revision: row.revision as TrackerPacketBody['revision'],
    kind: row.kind as TrackerPacketBody['kind'],
    outcome: row.outcome as TrackerPacketBody['outcome'],
    receivedAt: row.receivedAt.toISOString(),
    storedAt: row.storedAt.toISOString(),
    fixTime: row.fixTime?.toISOString() ?? null
  };
}

async function persist(body: TrackerPacketBody): Promise<TrackerPacketLog> {
  // ON CONFLICT locks the receipt row. Identity checks and revision comparisons
  // happen under that lock, including when several workers create it together.
  const rows = await prisma.$queryRaw<PacketRow[]>`
    INSERT INTO tracker_packet_logs AS existing (
      id, revision, received_at, connection_id, peer, device_id, vehicle_id,
      message_type, kind, outcome, raw_hex, fix_time, latitude, longitude,
      speed, heading, ignition, reason
    ) VALUES (
      ${body.id}::uuid, ${body.revision}, ${new Date(body.receivedAt)},
      ${body.connectionId}::uuid, ${body.peer}, ${body.deviceId}, ${body.vehicleId}::uuid,
      ${body.messageType}, ${body.kind}, ${body.outcome}, ${body.rawHex},
      ${body.fixTime ? new Date(body.fixTime) : null}::timestamptz,
      ${body.latitude}, ${body.longitude}, ${body.speed}, ${body.heading},
      ${body.ignition}, ${body.reason}
    )
    ON CONFLICT (id) DO UPDATE SET
      revision = GREATEST(existing.revision, EXCLUDED.revision),
      vehicle_id = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.vehicle_id ELSE existing.vehicle_id END,
      message_type = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.message_type ELSE existing.message_type END,
      kind = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.kind ELSE existing.kind END,
      outcome = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.outcome ELSE existing.outcome END,
      fix_time = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.fix_time ELSE existing.fix_time END,
      latitude = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.latitude ELSE existing.latitude END,
      longitude = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.longitude ELSE existing.longitude END,
      speed = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.speed ELSE existing.speed END,
      heading = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.heading ELSE existing.heading END,
      ignition = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.ignition ELSE existing.ignition END,
      reason = CASE WHEN existing.revision < EXCLUDED.revision THEN EXCLUDED.reason ELSE existing.reason END
    WHERE existing.received_at = EXCLUDED.received_at
      AND existing.connection_id = EXCLUDED.connection_id
      AND existing.peer = EXCLUDED.peer
      AND existing.device_id IS NOT DISTINCT FROM EXCLUDED.device_id
      AND lower(existing.raw_hex) = lower(EXCLUDED.raw_hex)
    RETURNING id, revision, received_at AS "receivedAt", stored_at AS "storedAt",
      connection_id AS "connectionId", peer, device_id AS "deviceId", vehicle_id AS "vehicleId",
      message_type AS "messageType", kind, outcome, raw_hex AS "rawHex", fix_time AS "fixTime",
      latitude, longitude, speed, heading, ignition, reason
  `;
  if (!rows[0]) {
    throw new AppError(
      409,
      'PACKET_IDENTITY_CONFLICT',
      'Packet identity differs from the original receipt'
    );
  }
  return serialize(rows[0]);
}

async function list(query: TrackerPacketQuery): Promise<TrackerPacketPage> {
  const filters: Prisma.TrackerPacketLogWhereInput[] = [];
  if (query.deviceId !== undefined) filters.push({ deviceId: query.deviceId });
  if (query.search)
    filters.push({ deviceId: { contains: query.search, mode: 'insensitive' } });
  if (query.kind) filters.push({ kind: query.kind });
  if (query.outcome) filters.push({ outcome: query.outcome });
  if (query.from || query.to)
    filters.push({
      receivedAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {})
      }
    });
  const where: Prisma.TrackerPacketLogWhereInput = { AND: filters };
  const pageFilters = [...filters];
  if (query.cursor) {
    const [timestamp, id] = query.cursor.split('|') as [string, string];
    const receivedAt = new Date(timestamp);
    pageFilters.push({
      OR: [{ receivedAt: { lt: receivedAt } }, { receivedAt, id: { lt: id } }]
    });
  }
  const [rows, count] = await prisma.$transaction(
    [
      prisma.trackerPacketLog.findMany({
        where: { AND: pageFilters },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1
      }),
      prisma.trackerPacketLog.count({ where })
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
  const data = rows.slice(0, query.limit).map(serialize);
  const last = data.at(-1);
  return {
    data,
    count,
    nextCursor:
      rows.length > query.limit && last ? `${last.receivedAt}|${last.id}` : null
  };
}

export async function uploadPacketLog(
  req: Request,
  res: Response
): Promise<void> {
  res.status(201).json(await persist(req.body as TrackerPacketBody));
}

export async function listPacketLogs(
  req: Request,
  res: Response
): Promise<void> {
  const page = await list(trackerPacketQuerySchema.parse(req.query));
  res.setHeader('Cache-Control', 'no-store');
  res.json(page);
}
