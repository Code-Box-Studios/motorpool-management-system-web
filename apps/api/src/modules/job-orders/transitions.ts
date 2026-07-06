import type { CompleteRepairBody, NoteJobOrderBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { changeVehicleStatus } from '../vehicles/status.js';
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
    await changeVehicleStatus(tx, order.vehicleId, 'under_maintenance', {
      changedBy: actor.id,
      source: 'job_order_note',
      expectedFrom: 'available'
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
    await tx.jobOrder.update({
      where: { id },
      data: {
        status: 'repaired',
        repairDone: body.repairDone,
        remarks: body.remarks ?? null,
        actualDateOfRelease: releaseDate
      }
    });
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
    await tx.maintenance.create({
      data: { vehicleId: order.vehicleId, type: 'repair', date: releaseDate, description: body.remarks ?? null }
    });
    await changeVehicleStatus(tx, order.vehicleId, 'available', {
      changedBy: actor.id,
      source: 'job_order_complete',
      expectedFrom: 'under_maintenance'
    });
  });
  return findJobOrderById(id);
}
