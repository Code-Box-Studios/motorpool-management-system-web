import type { TrackerDevicesListQuery } from '@mms/shared';
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findTrackerDeviceById(id: string) {
  return prisma.trackerDevice.findUnique({ where: { id } });
}

export function findTrackerDeviceByImei(imei: string) {
  return prisma.trackerDevice.findUnique({ where: { imei } });
}

export async function listTrackerDevices(
  skipTake: SkipTake,
  filters: Pick<TrackerDevicesListQuery, 'vehicleId' | 'status'>
) {
  const where = {
    ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    ...(filters.status ? { status: filters.status } : {})
  };
  const [data, count] = await Promise.all([
    prisma.trackerDevice.findMany({ where, orderBy: { updatedAt: 'desc' }, ...skipTake }),
    prisma.trackerDevice.count({ where })
  ]);
  return { data, count };
}
