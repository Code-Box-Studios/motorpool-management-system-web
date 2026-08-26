import { LIVE_TRIP_STATUSES } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

export interface Blocker {
  resource: string;
  count: number;
}

// Resolve a set of counts in parallel and keep only the non-zero ones, so the
// error payload names exactly what the admin has to deal with and nothing else.
async function collect(
  checks: { resource: string; count: Promise<number> }[]
): Promise<Blocker[]> {
  const counts = await Promise.all(checks.map((c) => c.count));
  return (
    checks
      // noUncheckedIndexedAccess: counts[i] is number | undefined, and the
      // lengths are identical by construction.
      .map((c, i) => ({ resource: c.resource, count: counts[i] ?? 0 }))
      .filter((b) => b.count > 0)
  );
}

const liveTicket = { in: [...LIVE_TRIP_STATUSES] };

// Everything that still points at a branch in a way that matters.
//
// Vehicles block whatever their status: a van is a physical object and a depot
// cannot be closed while vans are parked in it. Drivers and users do NOT block
// once inactive — an inactive person is history, the same category as a
// completed trip ticket. Child offices and heads block only while ACTIVE;
// counting archived children would make a branch impossible to empty, because
// children can only be archived and never deleted.
export function branchBlockers(id: string): Promise<Blocker[]> {
  return collect([
    {
      resource: 'vehicles',
      count: prisma.vehicle.count({ where: { branchId: id } })
    },
    {
      resource: 'drivers',
      count: prisma.driver.count({
        where: { branchId: id, status: { not: 'inactive' } }
      })
    },
    {
      resource: 'users',
      count: prisma.user.count({
        where: { branchId: id, status: { not: 'inactive' } }
      })
    },
    {
      resource: 'departmentOffices',
      count: prisma.departmentOffice.count({
        where: { branchId: id, archivedAt: null }
      })
    },
    {
      resource: 'officeHeads',
      count: prisma.officeHead.count({
        where: { branchId: id, archivedAt: null }
      })
    },
    {
      resource: 'tripTickets',
      count: prisma.tripTicket.count({
        where: { branchId: id, status: liveTicket }
      })
    },
    {
      resource: 'jobOrders',
      count: prisma.jobOrder.count({
        where: { branchId: id, status: { not: 'repaired' } }
      })
    }
  ]);
  // Fuel allocations are deliberately absent: FuelAllocation.tripTicketId is
  // unique with onDelete Cascade, so every allocation belongs to exactly one
  // ticket and the live-ticket count already covers it.
}

export function officeBlockers(id: string): Promise<Blocker[]> {
  return collect([
    {
      resource: 'officeHeads',
      count: prisma.officeHead.count({
        where: { officeId: id, archivedAt: null }
      })
    },
    {
      resource: 'tripTickets',
      count: prisma.tripTicket.count({
        where: { officeId: id, status: liveTicket }
      })
    }
  ]);
}

export function officeHeadBlockers(id: string): Promise<Blocker[]> {
  return collect([
    {
      resource: 'departmentOffices',
      count: prisma.departmentOffice.count({
        where: { headId: id, archivedAt: null }
      })
    },
    {
      resource: 'tripTickets',
      count: prisma.tripTicket.count({
        where: { officeHeadId: id, status: liveTicket }
      })
    }
  ]);
}

// `details.blockers` is what lets the UI render "1 department office, 2
// vehicles" instead of a flat refusal.
export function assertArchivable(name: string, blockers: Blocker[]): void {
  if (blockers.length === 0) return;
  throw new AppError(409, 'IN_USE', `${name} is still in use`, { blockers });
}
