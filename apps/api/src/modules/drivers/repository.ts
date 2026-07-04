import { prisma } from '../../lib/prisma.js';

export function findDriverById(id: string) {
  return prisma.driver.findUnique({ where: { id } });
}

export function findDriverByEmail(email: string) {
  return prisma.driver.findUnique({ where: { email } });
}

export async function listDrivers(
  skipTake: { skip: number; take: number } | Record<string, never>,
  onlyUserId?: string
) {
  // Spec §5 matrix: driver-role callers see only their own personnel row.
  const where = onlyUserId ? { userId: onlyUserId } : undefined;
  const [data, count] = await Promise.all([
    prisma.driver.findMany({ where, orderBy: { fullName: 'asc' }, ...skipTake }),
    prisma.driver.count({ where })
  ]);
  return { data, count };
}
