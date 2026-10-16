import type { ApprovalHistoryQuery } from '@mms/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

// Only settled decisions. A `pending` allocation has not been decided and a
// `cancelled` one was withdrawn by the requester, not decided by anybody —
// showing either as a decision would misattribute it (spec §3.2).
const DECIDED = ['approved', 'disapproved'] as const;

function decidedWhere(
  outcome: ApprovalHistoryQuery['outcome']
): Prisma.FuelAllocationWhereInput {
  return {
    status: outcome
      ? outcome === 'approved'
        ? 'approved'
        : 'disapproved'
      : { in: [...DECIDED] }
  };
}

export function decidedAllocations(
  take: number | undefined,
  outcome?: ApprovalHistoryQuery['outcome']
) {
  return prisma.fuelAllocation.findMany({
    where: decidedWhere(outcome),
    include: {
      tripTicket: { select: { id: true, ticketNo: true, destination: true } },
      vehicle: { select: { make: true, model: true, licensePlate: true } },
      decidedBy: {
        select: { fullName: true, userRole: { select: { role: true } } }
      }
    },
    // Nulls last so pre-migration rows do not open the list (spec §3.3).
    orderBy: { decidedAt: { sort: 'desc', nulls: 'last' } },
    ...(take === undefined ? {} : { take })
  });
}

export function approvedJobOrders(take: number | undefined) {
  return prisma.jobOrder.findMany({
    where: { approvedById: { not: null } },
    include: {
      vehicle: { select: { make: true, model: true, licensePlate: true } },
      approvedBy: {
        select: { fullName: true, userRole: { select: { role: true } } }
      }
    },
    orderBy: { dateApproved: { sort: 'desc', nulls: 'last' } },
    ...(take === undefined ? {} : { take })
  });
}

export function countDecidedAllocations(
  outcome?: ApprovalHistoryQuery['outcome']
) {
  return prisma.fuelAllocation.count({
    where: decidedWhere(outcome)
  });
}

export function countApprovedJobOrders() {
  return prisma.jobOrder.count({ where: { approvedById: { not: null } } });
}
