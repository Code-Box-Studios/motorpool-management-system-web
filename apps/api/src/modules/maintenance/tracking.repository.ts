import { prisma } from '../../lib/prisma.js';

export function findTrackingWithItem(id: string) {
  return prisma.vehicleMaintenanceTracking.findUnique({
    where: { id },
    include: { scheduleItem: true }
  });
}

export function listTrackingForVehicle(vehicleId: string) {
  return prisma.vehicleMaintenanceTracking.findMany({
    where: { vehicleId },
    include: { scheduleItem: true }
  });
}

export function findTrackedItemIds(vehicleId: string) {
  return prisma.vehicleMaintenanceTracking.findMany({
    where: { vehicleId },
    select: { maintenanceScheduleItemId: true }
  });
}
