import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findToolById(id: string) {
  return prisma.tool.findUnique({ where: { id } });
}

export async function listTools(
  skipTake: SkipTake,
  orderBy: Prisma.ToolOrderByWithRelationInput = { updatedAt: 'desc' }
) {
  const [data, count] = await Promise.all([
    prisma.tool.findMany({ orderBy, ...skipTake }),
    prisma.tool.count()
  ]);
  return { data, count };
}
