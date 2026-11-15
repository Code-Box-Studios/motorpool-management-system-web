import type { GpsHistoryQuery, IngestGpsBody } from '@mms/shared';
import * as repo from './repository.js';

export async function ingest(body: IngestGpsBody) {
  const point = await repo.ingest(body);
  return { success: true, gpsId: point.id, vehicleId: point.vehicleId };
}

export async function latest() {
  const rows = await repo.latestPerVehicle();
  return { data: rows, count: rows.length };
}

export async function history(query: GpsHistoryQuery) {
  return repo.history(query);
}
