import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findMaintenanceById(id: string) {
  return prisma.maintenance.findUnique({ where: { id } });
}

export async function listMaintenance(
  vehicleId: string | undefined,
  skipTake: SkipTake,
  orderBy: Prisma.MaintenanceOrderByWithRelationInput = { updatedAt: 'desc' }
) {
  const where = vehicleId ? { vehicleId } : undefined;
  const [data, count] = await Promise.all([
    prisma.maintenance.findMany({ where, orderBy, ...skipTake }),
    prisma.maintenance.count({ where })
  ]);
  return { data, count };
}
