import type { CompleteRepairBody, NoteJobOrderBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import {
  advanceOdometer,
  changeVehicleStatus,
  claimVehicleStatus
} from '../vehicles/status.js';
import { findJobOrderById } from './repository.js';

async function loadInState(id: string, allowedFrom: string[]) {
  const order = await prisma.jobOrder.findUnique({ where: { id } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (!allowedFrom.includes(order.status)) {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Not allowed from status ${order.status}`
    );
  }
  return order;
}

// admin note → assigned_mechanic; records the mechanic + spare-parts join rows
// and flips the vehicle to under_maintenance. One transaction.
export async function note(
  id: string,
  actor: AuthenticatedUser,
  body: NoteJobOrderBody
) {
  const order = await loadInState(id, ['pending']);
  await prisma.$transaction(async (tx) => {
    // A van that is out on a trip is not in the workshop. This used to be a soft
    // `expectedFrom: 'available'`, so noting a job order on a vehicle that was on
    // the road silently skipped the flip — and when the guard later checked that
    // trip back in, the van went to `available` while it was under repair.
    //
    // The claim is conditional so it cannot race a concurrent check-out: whoever
    // commits first wins, and the loser is refused rather than both proceeding.
    await claimVehicleStatus(
      tx,
      order.vehicleId,
      ['available', 'unavailable', 'out_of_service', 'under_maintenance'],
      'under_maintenance',
      {
        changedBy: actor.id,
        source: 'job_order_note',
        code: 'VEHICLE_ON_TRIP',
        message: (current) =>
          `Vehicle is ${current}; it cannot be taken into the workshop until it is back`
      }
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
    // Parts come off the shelf HERE, when they are committed to this repair —
    // not at complete-repair, which is only the paperwork closing. Issuing them
    // at the point of commitment is what makes the check below possible at all:
    // two job orders can no longer each note the last brake pad and both go on
    // to complete, driving stock negative with nothing to stop it.
    //
    // The same part can appear twice in one note, so sum by part before checking.
    const wanted = new Map<string, number>();
    for (const line of body.spareParts) {
      wanted.set(
        line.sparePartId,
        (wanted.get(line.sparePartId) ?? 0) + line.quantity
      );
    }

    for (const [sparePartId, quantity] of wanted) {
      const part = await tx.sparePart.findUnique({
        where: { id: sparePartId },
        select: { name: true, quantity: true }
      });
      if (!part) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
      if (part.quantity < quantity) {
        throw new AppError(
          409,
          'INSUFFICIENT_STOCK',
          `Only ${part.quantity} × ${part.name} on the shelf; the repair needs ${quantity}`
        );
      }
    }

    // Replace any existing join rows with the noted set.
    await tx.jobOrderSparePart.deleteMany({ where: { jobOrderId: id } });
    if (body.spareParts.length > 0) {
      await tx.jobOrderSparePart.createMany({
        data: body.spareParts.map((p) => ({
          jobOrderId: id,
          sparePartId: p.sparePartId,
          quantity: p.quantity
        }))
      });
    }
    for (const [sparePartId, quantity] of wanted) {
      await tx.sparePart.update({
        where: { id: sparePartId },
        data: { quantity: { decrement: quantity } }
      });
    }
  });
  return findJobOrderById(id);
}

// evp approve → ongoing_repair (admin too, as the stand-in when no EVP is on).
export async function approve(id: string, actor: AuthenticatedUser) {
  await loadInState(id, ['assigned_mechanic']);
  await prisma.jobOrder.update({
    where: { id },
    data: {
      status: 'ongoing_repair',
      approvedById: actor.id,
      dateApproved: new Date()
    }
  });
  return findJobOrderById(id);
}

// admin complete-repair → repaired; writes a maintenance history row and flips
// the vehicle back to available. One transaction.
//
// It does NOT touch inventory: the parts came off the shelf at `note`, when they
// were committed to this repair. Decrementing here — with no stock floor — was
// what let two job orders each claim the last part and both complete, taking
// stock negative and quietly corrupting every "In stock" / "Low stock" badge.
export async function completeRepair(
  id: string,
  actor: AuthenticatedUser,
  body: CompleteRepairBody
) {
  const order = await prisma.jobOrder.findUnique({ where: { id } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (order.status !== 'ongoing_repair') {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Not allowed from status ${order.status}`
    );
  }
  const releaseDate = body.actualDateOfRelease ?? new Date();
  await prisma.$transaction(async (tx) => {
    // Conditional write: only flips rows still in ongoing_repair. Under a
    // concurrent double-submit the loser blocks on the row lock, re-evaluates the
    // WHERE against the winner's committed status, matches 0, and aborts here —
    // so the maintenance row is written exactly once.
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
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        `Not allowed from status ${order.status}`
      );
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
    await advanceOdometer(
      tx,
      order.vehicleId,
      body.completedMileage,
      vehicle.mileage
    );
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
