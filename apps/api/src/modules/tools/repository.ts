import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findToolById(id: string) {
  return prisma.tool.findUnique({ where: { id } });
}

export async function listTools(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.tool.findMany({ orderBy: { updatedAt: 'desc' }, ...skipTake }),
    prisma.tool.count()
  ]);
  return { data, count };
}
