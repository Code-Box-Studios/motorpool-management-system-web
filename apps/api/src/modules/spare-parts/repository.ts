import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findSparePartById(id: string) {
  return prisma.sparePart.findUnique({ where: { id } });
}

export async function listSpareParts(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.sparePart.findMany({ orderBy: { updatedAt: 'desc' }, ...skipTake }),
    prisma.sparePart.count()
  ]);
  return { data, count };
}
