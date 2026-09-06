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

export function countOpenBorrows() {
  return prisma.toolBorrow.count({ where: { returnedAt: null } });
}

// Overdue means still out AND past due. `returnedAt: null` is not optional:
// without it a tool that came back late counts forever.
export function countOverdueBorrows(today: Date) {
  return prisma.toolBorrow.count({
    where: { returnedAt: null, dueAt: { lt: today } }
  });
}

export function borrowsSince(since: Date) {
  return prisma.toolBorrow.findMany({
    where: { borrowedAt: { gte: since } },
    select: {
      toolId: true,
      borrowedAt: true,
      returnedAt: true,
      dueAt: true,
      tool: { select: { name: true } }
    }
  });
}
