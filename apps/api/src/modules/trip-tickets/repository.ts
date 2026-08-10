import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

// Relations the FE renders (spec §6.1 read contract). The FE flattens
// fuelAllocation into allocation_* names in Plan 7.
export const tripTicketInclude = {
  driver: true,
  vehicle: true,
  office: true,
  officeHead: true,
  fuelAllocation: true
} satisfies Prisma.TripTicketInclude;

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findTripTicketById(id: string) {
  return prisma.tripTicket.findUnique({
    where: { id },
    include: tripTicketInclude
  });
}

export async function listTripTickets(
  where: Prisma.TripTicketWhereInput,
  skipTake: SkipTake,
  orderBy: Prisma.TripTicketOrderByWithRelationInput = { updatedAt: 'desc' }
) {
  const [data, count] = await Promise.all([
    prisma.tripTicket.findMany({
      where,
      include: tripTicketInclude,
      orderBy,
      ...skipTake
    }),
    prisma.tripTicket.count({ where })
  ]);
  return { data, count };
}
