import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

// Relations the FE renders (spec §6.1 read contract). The FE flattens
// fuelAllocation into allocation_* names in Plan 7.
export const tripTicketInclude = {
  driver: true,
  vehicle: true,
  office: true,
  officeHead: true,
  fuelAllocation: true,
  dates: { orderBy: { startTs: 'asc' as const } },
  // Guides come back through the join WITH the employee attached, so a ticket
  // keeps rendering an archived employee's name: archiving hides someone from
  // future bookings, it never rewrites history. This one const serves both the
  // detail read and the list read — and there is no response contract anywhere
  // that would catch it if guides went missing from either.
  guides: { include: { employee: true } }
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
