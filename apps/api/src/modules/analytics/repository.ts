import { prisma } from '../../lib/prisma.js';

export async function vehicleStatusCounts() {
  const groups = await prisma.vehicle.groupBy({
    by: ['status'],
    _count: { _all: true }
  });
  const total = await prisma.vehicle.count();
  return { groups, total };
}

export function completedTripsCount() {
  return prisma.tripTicket.count({ where: { status: 'completed' } });
}

export function vehiclesWithMaintenance() {
  return prisma.vehicle.findMany({
    include: { maintenances: { orderBy: { date: 'desc' } } }
  });
}

// Job orders that used spare parts, with the join rows + the vehicle (for the
// optional vehicleType filter).
export function jobOrdersWithSpareParts() {
  return prisma.jobOrder.findMany({
    where: { spareParts: { some: {} } },
    include: { spareParts: true, vehicle: { select: { make: true } } }
  });
}

export function allSpareParts() {
  return prisma.sparePart.findMany({ select: { id: true, name: true } });
}
