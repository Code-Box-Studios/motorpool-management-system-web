import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findStandardById(id: string) {
  return prisma.maintenanceStandard.findUnique({
    where: { id },
    include: { scheduleItems: true }
  });
}

export async function listStandards(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.maintenanceStandard.findMany({
      orderBy: { name: 'asc' },
      include: { scheduleItems: true },
      ...skipTake
    }),
    prisma.maintenanceStandard.count()
  ]);
  return { data, count };
}
