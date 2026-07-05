import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findMaintenanceById(id: string) {
  return prisma.maintenance.findUnique({ where: { id } });
}

export async function listMaintenance(vehicleId: string | undefined, skipTake: SkipTake) {
  const where = vehicleId ? { vehicleId } : undefined;
  const [data, count] = await Promise.all([
    prisma.maintenance.findMany({ where, orderBy: { date: 'desc' }, ...skipTake }),
    prisma.maintenance.count({ where })
  ]);
  return { data, count };
}
