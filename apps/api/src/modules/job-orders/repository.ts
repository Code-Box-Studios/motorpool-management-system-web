import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

// Embeds the FE renders: vehicle summary, the spare-parts join (+ each part),
// and the assigned mechanic. noted/approved/requested users are resolved
// client-side (matching current behavior).
export const jobOrderInclude = {
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true } },
  spareParts: { include: { sparePart: true } },
  assignedMechanic: true
} satisfies Prisma.JobOrderInclude;

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findJobOrderById(id: string) {
  return prisma.jobOrder.findUnique({ where: { id }, include: jobOrderInclude });
}

export async function listJobOrders(where: Prisma.JobOrderWhereInput, skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.jobOrder.findMany({ where, include: jobOrderInclude, orderBy: { targetDate: 'asc' }, ...skipTake }),
    prisma.jobOrder.count({ where })
  ]);
  return { data, count };
}
