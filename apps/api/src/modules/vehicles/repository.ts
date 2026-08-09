import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findVehicleById(id: string) {
  return prisma.vehicle.findUnique({ where: { id } });
}

export async function listVehicles(
  skipTake: SkipTake,
  orderBy:
    | Prisma.VehicleOrderByWithRelationInput
    | Prisma.VehicleOrderByWithRelationInput[] = [{ make: 'asc' }, { model: 'asc' }]
) {
  const [data, count] = await Promise.all([
    prisma.vehicle.findMany({ orderBy, ...skipTake }),
    prisma.vehicle.count()
  ]);
  return { data, count };
}
