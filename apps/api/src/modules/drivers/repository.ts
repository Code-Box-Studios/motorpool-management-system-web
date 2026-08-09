import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export function findDriverById(id: string) {
  return prisma.driver.findUnique({ where: { id } });
}

export function findDriverByEmail(email: string) {
  return prisma.driver.findUnique({ where: { email } });
}

export async function listDrivers(
  skipTake: { skip: number; take: number } | Record<string, never>,
  onlyUserId?: string,
  orderBy: Prisma.DriverOrderByWithRelationInput = { updatedAt: 'desc' }
) {
  // Spec §5 matrix: driver-role callers see only their own personnel row.
  const where = onlyUserId ? { userId: onlyUserId } : undefined;
  const [data, count] = await Promise.all([
    prisma.driver.findMany({ where, orderBy, ...skipTake }),
    prisma.driver.count({ where })
  ]);
  return { data, count };
}

// The driver row linked to a login — used to scope job-order visibility to the
// caller's assigned repairs (spec §6).
export function findDriverByUserId(userId: string) {
  return prisma.driver.findUnique({ where: { userId } });
}
