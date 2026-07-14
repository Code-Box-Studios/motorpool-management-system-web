import type { CompleteRepairBody, NoteJobOrderBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { advanceOdometer, changeVehicleStatus, requireVehicleStatus } from '../vehicles/status.js';
import { findJobOrderById } from './repository.js';

async function loadInState(id: string, allowedFrom: string[]) {
  const order = await prisma.jobOrder.findUnique({ where: { id } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (!allowedFrom.includes(order.status)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Not allowed from status ${order.status}`);
  }
  return order;
}

// admin note → assigned_mechanic; records the mechanic + spare-parts join rows
// and flips the vehicle to under_maintenance. One transaction.
export async function note(id: string, actor: AuthenticatedUser, body: NoteJobOrderBody) {
  const order = await loadInState(id, ['pending']);
  await prisma.$transaction(async (tx) => {
    // A van that is out on a trip is not in the workshop. This used to be a soft
    // `expectedFrom: 'available'`, so noting a job order on a vehicle that was
    // on the road silently skipped the flip — and when the guard later checked
    // that trip back in, the van went to `available` while it was under repair.
    await requireVehicleStatus(
      tx,
      order.vehicleId,
      ['available', 'unavailable', 'out_of_service', 'under_maintenance'],
      'VEHICLE_ON_TRIP',
      (current) => `Vehicle is ${current}; it cannot be taken into the workshop until it is back`
    );
    await tx.jobOrder.update({
      where: { id },
      data: {
        status: 'assigned_mechanic',
        notedById: actor.id,
        dateOfRequest: body.dateOfRequest ?? null,
        targetDate: body.targetDate ?? null,
        assignedMechanicId: body.assignedMechanicId
      }
    });
    // Replace any existing join rows with the noted set.
    await tx.jobOrderSparePart.deleteMany({ where: { jobOrderId: id } });
    if (body.spareParts.length > 0) {
      await tx.jobOrderSparePart.createMany({
        data: body.spareParts.map((p) => ({ jobOrderId: id, sparePartId: p.sparePartId, quantity: p.quantity }))
      });
    }
    // No expectedFrom: the precondition above already established the vehicle is
    // here, and a van that was out_of_service is exactly the one you'd repair.
    await changeVehicleStatus(tx, order.vehicleId, 'under_maintenance', {
      changedBy: actor.id,
      source: 'job_order_note'
    });
  });
  return findJobOrderById(id);
}

// evp approve → ongoing_repair.
export async function approve(id: string, actor: AuthenticatedUser) {
  await loadInState(id, ['assigned_mechanic']);
  await prisma.jobOrder.update({
    where: { id },
    data: { status: 'ongoing_repair', approvedById: actor.id, dateApproved: new Date() }
  });
  return findJobOrderById(id);
}

// admin complete-repair → repaired; decrements spare-parts inventory, writes a
// maintenance history row, and flips the vehicle back to available. One
// transaction (spec §6.2 — this inventory decrement is NEW behavior).
export async function completeRepair(id: string, actor: AuthenticatedUser, body: CompleteRepairBody) {
  const order = await prisma.jobOrder.findUnique({ where: { id }, include: { spareParts: true } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (order.status !== 'ongoing_repair') {
    throw new AppError(409, 'INVALID_TRANSITION', `Not allowed from status ${order.status}`);
  }
  const releaseDate = body.actualDateOfRelease ?? new Date();
  await prisma.$transaction(async (tx) => {
    // Conditional write: only flips rows still in ongoing_repair. Under concurrent
    // double-submit, the loser's updateMany blocks on the row lock, re-evaluates
    // the WHERE against the winner's committed status, matches 0, and aborts here
    // — before the decrement loop runs — preventing a double decrement.
    const flipped = await tx.jobOrder.updateMany({
      where: { id, status: 'ongoing_repair' },
      data: {
        status: 'repaired',
        repairDone: body.repairDone,
        remarks: body.remarks ?? null,
        actualDateOfRelease: releaseDate
      }
    });
    if (flipped.count === 0) {
      throw new AppError(409, 'INVALID_TRANSITION', `Not allowed from status ${order.status}`);
    }
    // Decrement inventory per noted part (spec §6.2 — NEW behavior). Intentionally
    // NO stock floor: a physically-completed repair is never blocked on inventory
    // math, and clamping would hide over-use. A negative quantity is an accepted
    // signal for admin reconciliation. (Revisit if a hard stock guard is wanted.)
    for (const line of order.spareParts) {
      await tx.sparePart.update({
        where: { id: line.sparePartId },
        data: { quantity: { decrement: line.quantity } }
      });
    }
    // The odometer the repair was signed off at. Without it this row was written
    // with `mileage: null`, and the risk model reads a null last-service mileage
    // as ZERO — so "distance since last service" became the vehicle's ENTIRE
    // odometer and a freshly repaired van scored as critically overdue. A clean
    // repair on a 33,000 km van drove its risk from 36/100 to 95/100.
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: order.vehicleId },
      select: { mileage: true }
    });
    await advanceOdometer(tx, order.vehicleId, body.completedMileage, vehicle.mileage);
    await tx.maintenance.create({
      data: {
        vehicleId: order.vehicleId,
        type: 'repair',
        date: releaseDate,
        mileage: body.completedMileage,
        description: body.remarks ?? null
      }
    });
    await changeVehicleStatus(tx, order.vehicleId, 'available', {
      changedBy: actor.id,
      source: 'job_order_complete',
      expectedFrom: 'under_maintenance'
    });
  });
  return findJobOrderById(id);
}
