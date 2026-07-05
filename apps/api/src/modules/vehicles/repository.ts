import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findVehicleById(id: string) {
  return prisma.vehicle.findUnique({ where: { id } });
}

export async function listVehicles(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.vehicle.findMany({ orderBy: [{ make: 'asc' }, { model: 'asc' }], ...skipTake }),
    prisma.vehicle.count()
  ]);
  return { data, count };
}
