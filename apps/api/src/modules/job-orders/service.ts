import type { Prisma } from '@prisma/client';
import type { CreateJobOrderBody, JobOrdersListQuery, UpdateJobOrderBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { toOrderBy } from '../../lib/sorting.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findDriverByUserId } from '../drivers/repository.js';
import { changeVehicleStatus } from '../vehicles/status.js';
import { findJobOrderById, jobOrderInclude, listJobOrders } from './repository.js';

// Visibility (spec §6): admin/evp see all; everyone else sees rows they
// requested OR that are assigned to their driver row (via drivers.userId).
async function scopeFor(actor: AuthenticatedUser): Promise<Prisma.JobOrderWhereInput> {
  if (actor.role === 'admin' || actor.role === 'evp_operations') return {};
  const driver = await findDriverByUserId(actor.id);
  const or: Prisma.JobOrderWhereInput[] = [{ requestedById: actor.id }];
  if (driver) or.push({ assignedMechanicId: driver.id });
  return { OR: or };
}

export async function list(query: JobOrdersListQuery, actor: AuthenticatedUser) {
  const scope = await scopeFor(actor);
  const where: Prisma.JobOrderWhereInput = { ...scope, ...(query.status ? { status: query.status } : {}) };
  const orderBy = toOrderBy<Prisma.JobOrderOrderByWithRelationInput>(
    query.sortBy,
    query.sortOrder,
    {
      orderNo: (order) => ({ orderNo: order }),
      status: (order) => ({ status: order }),
      // Vehicle and mechanic are to-one relations — sort by their display name.
      vehicle: (order) => ({ vehicle: { make: order } }),
      incidentDate: (order) => ({ incidentDate: order }),
      assignedMechanic: (order) => ({ assignedMechanic: { fullName: order } }),
      targetDate: (order) => ({ targetDate: order }),
      repairDone: (order) => ({ repairDone: order })
    },
    { updatedAt: 'desc' }
  );
  return listJobOrders(where, toSkipTake(query), orderBy);
}

export async function getById(id: string, actor: AuthenticatedUser) {
  const order = await findJobOrderById(id);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (actor.role !== 'admin' && actor.role !== 'evp_operations') {
    const driver = await findDriverByUserId(actor.id);
    const mine = order.requestedById === actor.id || (driver !== null && order.assignedMechanicId === driver.id);
    if (!mine) throw new AppError(404, 'NOT_FOUND', 'Job order not found'); // not-found masking
  }
  return order;
}

export async function create(body: CreateJobOrderBody, actor: AuthenticatedUser) {
  // WHO RAISED IT is the authenticated caller — the same hole the trip tickets
  // had, still open here. `requestedById` came straight out of the body, so a
  // driver could raise a job order in the admin's name, or with no owner at all
  // (`requestedById: null`) — and since scopeFor() above filters on exactly that
  // column, an unowned job order becomes invisible to everyone but admin/EVP.
  //
  // An admin raising one on someone's behalf is a real workflow, so they may
  // still name the requester. Nobody else can.
  const requestedById =
    actor.role === 'admin' && body.requestedById ? body.requestedById : actor.id;

  // The incident cannot have happened tomorrow.
  if (body.incidentDate && body.incidentDate.getTime() > Date.now()) {
    throw new AppError(400, 'INCIDENT_IN_THE_FUTURE', 'An incident date cannot be in the future');
  }

  return prisma.jobOrder.create({
    data: { ...body, requestedById, status: 'pending' },
    include: jobOrderInclude
  });
}

export async function update(id: string, body: UpdateJobOrderBody) {
  const existing = await findJobOrderById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (existing.status !== 'pending') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Job order can only be edited while pending');
  }
  await prisma.jobOrder.update({ where: { id }, data: body });
  return findJobOrderById(id);
}

export async function remove(id: string): Promise<void> {
  const existing = await prisma.jobOrder.findUnique({
    where: { id },
    include: { spareParts: true }
  });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Job order not found');

  // A repair that happened is a record: it consumed parts off the shelf, wrote a
  // maintenance row, and released the vehicle. Deleting it erases the reason the
  // stock is gone and leaves the maintenance history pointing at nothing.
  if (existing.status === 'repaired') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Cannot delete a job order that has been repaired');
  }

  await prisma.$transaction(async (tx) => {
    // Parts are issued at `note`. Abandoning the job puts them back on the shelf
    // — without this, reserving them at note would simply lose them: the join
    // rows cascade away on delete and the stock never returns.
    for (const line of existing.spareParts) {
      await tx.sparePart.update({
        where: { id: line.sparePartId },
        data: { quantity: { increment: line.quantity } }
      });
    }
    await tx.jobOrder.delete({ where: { id } }); // job_order_spare_parts cascade (schema)

    // Noting a job order takes the vehicle INTO the workshop. Deleting that job
    // order used to leave it there — stranded in `under_maintenance` with no job
    // order left to explain why, and unbookable until someone noticed and edited
    // it by hand. Let it out, unless another live repair is still holding it.
    const heldByAnother = await tx.jobOrder.count({
      where: {
        vehicleId: existing.vehicleId,
        status: { in: ['assigned_mechanic', 'ongoing_repair'] }
      }
    });
    if (heldByAnother === 0) {
      await changeVehicleStatus(tx, existing.vehicleId, 'available', {
        changedBy: null,
        source: 'job_order_note',
        reason: 'job order deleted',
        expectedFrom: 'under_maintenance'
      });
    }
  });
}
