import type { Prisma } from '@prisma/client';
import type { GpsHistoryQuery, IngestGpsBody } from '@mms/shared';
import * as repo from './repository.js';

export async function ingest(body: IngestGpsBody) {
  const point = await repo.ingest(body);
  return { success: true, gpsId: point.id };
}

export async function latest() {
  const rows = await repo.latestPerVehicle();
  return { data: rows, count: rows.length };
}

export async function history(query: GpsHistoryQuery) {
  const where: Prisma.GpsDataWhereInput = {
    vehicleId: query.vehicleId,
    ...(query.tripId ? { tripId: query.tripId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {})
          }
        }
      : {})
  };
  return repo.history(where, query.limit);
}
