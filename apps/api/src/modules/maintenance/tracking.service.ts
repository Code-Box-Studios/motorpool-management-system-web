import type { CompleteTrackingBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { computeNextDue, deriveTrackingStatus } from './next-due.js';
import {
  findTrackedItemIds,
  findTrackingWithItem,
  listTrackingForVehicle
} from './tracking.repository.js';

// Assigns a standard to a vehicle and creates a tracking row for every schedule
// item not already tracked (seeded from today + current mileage, status
// 'pending'). Existing tracking rows — and their completion history — are left
// intact. Returns { data, count } of the NEWLY created rows.
export async function assign(vehicleId: string, maintenanceStandardId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { mileage: true } });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  const standard = await prisma.maintenanceStandard.findUnique({
    where: { id: maintenanceStandardId },
    include: { scheduleItems: true }
  });
  if (!standard) throw new AppError(404, 'NOT_FOUND', 'Maintenance standard not found');

  const trackedIds = new Set(
    (await findTrackedItemIds(vehicleId)).map((t) => t.maintenanceScheduleItemId)
  );
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { maintenanceStandardId } });
    const rows = [];
    for (const item of standard.scheduleItems) {
      if (trackedIds.has(item.id)) continue;
      const { nextDueDate, nextDueMileage } = computeNextDue(
        now,
        vehicle.mileage,
        item.intervalMonths,
        item.intervalMileage
      );
      rows.push(
        await tx.vehicleMaintenanceTracking.create({
          data: {
            vehicleId,
            maintenanceScheduleItemId: item.id,
            status: 'pending',
            nextDueDate,
            nextDueMileage
          }
        })
      );
    }
    return rows;
  });

  return { data: created, count: created.length };
}

export async function listForVehicle(vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { mileage: true } });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  const now = new Date();
  const rows = await listTrackingForVehicle(vehicleId);
  const priority = { overdue: 0, due_soon: 1, pending: 2, completed: 3 } as const;
  const data = rows
    .map((t) => ({ ...t, displayStatus: deriveTrackingStatus(t, now, vehicle.mileage) }))
    .sort((a, b) => priority[a.displayStatus] - priority[b.displayStatus]);
  return { data, count: data.length };
}

// Records a completion and recomputes next-due in ONE transaction (the FE did
// these as separate calls; the API makes them atomic).
export async function complete(trackingId: string, actorId: string, body: CompleteTrackingBody) {
  const tracking = await findTrackingWithItem(trackingId);
  if (!tracking) throw new AppError(404, 'NOT_FOUND', 'Tracking record not found');
  const now = new Date();
  const { nextDueDate, nextDueMileage } = computeNextDue(
    now,
    body.completedMileage,
    tracking.scheduleItem.intervalMonths,
    tracking.scheduleItem.intervalMileage
  );

  return prisma.$transaction(async (tx) => {
    await tx.maintenanceCompletionLog.create({
      data: {
        vehicleMaintenanceTrackingId: trackingId,
        completedById: actorId,
        completedMileage: body.completedMileage,
        notes: body.notes ?? null
      }
    });
    return tx.vehicleMaintenanceTracking.update({
      where: { id: trackingId },
      data: {
        lastCompletedDate: now,
        lastCompletedMileage: body.completedMileage,
        nextDueDate,
        nextDueMileage,
        status: 'completed'
      }
    });
  });
}
