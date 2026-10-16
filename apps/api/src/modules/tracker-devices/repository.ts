import type { TrackerDevicesListQuery } from '@mms/shared';
import type { Prisma } from '@prisma/client';
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
  filters: Pick<TrackerDevicesListQuery, 'vehicleId' | 'status' | 'assignment'>,
  orderBy: Prisma.TrackerDeviceOrderByWithRelationInput = { updatedAt: 'desc' },
  searchWhere: Prisma.TrackerDeviceWhereInput = {}
) {
  const where: Prisma.TrackerDeviceWhereInput = {
    AND: [
      searchWhere,
      ...(filters.vehicleId ? [{ vehicleId: filters.vehicleId }] : []),
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(filters.assignment === 'assigned'
        ? [{ vehicleId: { not: null } }]
        : filters.assignment === 'unassigned'
          ? [{ vehicleId: null }]
          : [])
    ]
  };
  const [data, count] = await Promise.all([
    prisma.trackerDevice.findMany({ where, orderBy, ...skipTake }),
    prisma.trackerDevice.count({ where })
  ]);
  return { data, count };
}
