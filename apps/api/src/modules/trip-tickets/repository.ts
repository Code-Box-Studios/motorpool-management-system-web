import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { operationalDriverSelect } from '../drivers/projection.js';

// Relations the FE renders (spec §6.1 read contract). The FE flattens
// fuelAllocation into allocation_* names in Plan 7.
export const tripTicketInclude = {
  driver: { select: operationalDriverSelect },
  vehicle: true,
  office: true,
  officeHead: true,
  fuelAllocation: true,
  dates: { orderBy: { startTs: 'asc' as const } },
  participantEmployees: {
    include: {
      employee: {
        select: { id: true, name: true, position: true, archivedAt: true }
      }
    },
    orderBy: [{ createdAt: 'asc' as const }, { employeeId: 'asc' as const }]
  },
  // Ticket readers need guide identity, never private roster contact details.
  // Employee assignments remain readable, including archived names.
  // Historical user assignments expose only the identity and role needed to render a guide.
  guides: {
    include: {
      employee: {
        select: { id: true, name: true, position: true, archivedAt: true }
      },
      user: {
        select: {
          id: true,
          fullName: true,
          userRole: { select: { role: { select: { name: true } } } }
        }
      }
    }
  }
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
