import type { ApproveTripTicketBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { changeVehicleStatus } from '../vehicles/status.js';
import { findTripTicketById } from './repository.js';

// Loads the ticket and asserts its current status is in the allowed-from set.
async function loadInState(id: string, allowedFrom: string[]) {
  const ticket = await prisma.tripTicket.findUnique({ where: { id } });
  if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  if (!allowedFrom.includes(ticket.status)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Not allowed from status ${ticket.status}`);
  }
  return ticket;
}

// admin approve → pending_fuel_allocation_approval; creates the fuel allocation
// (copies vehicleId, backfills branchId, requestedById = approving admin,
// status pending). One transaction.
export async function approve(id: string, actor: AuthenticatedUser, body: ApproveTripTicketBody) {
  const ticket = await loadInState(id, ['pending_admin_approval']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: { status: 'pending_fuel_allocation_approval', approvedByAdminId: actor.id }
    });
    await tx.fuelAllocation.create({
      data: {
        tripTicketId: id,
        vehicleId: ticket.vehicleId,
        branchId: ticket.branchId,
        requestedById: actor.id,
        liters: body.liters,
        fuelType: body.fuelType,
        date: body.date,
        purpose: body.purpose,
        tripTo: body.tripTo,
        status: 'pending'
      }
    });
  });
  return findTripTicketById(id);
}

// evp approve → approved; stamps the allocation.
export async function approveEvp(id: string, actor: AuthenticatedUser) {
  await loadInState(id, ['pending_fuel_allocation_approval']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data: { status: 'approved' } });
    await tx.fuelAllocation.update({
      where: { tripTicketId: id },
      data: { status: 'approved', approvedByEvpId: actor.id }
    });
  });
  return findTripTicketById(id);
}

// disapprove (admin from both pending states; evp from the fuel-pending state).
export async function disapprove(id: string, actor: AuthenticatedUser, reason: string) {
  const allowedFrom =
    actor.role === 'evp_operations'
      ? ['pending_fuel_allocation_approval']
      : ['pending_admin_approval', 'pending_fuel_allocation_approval'];
  await loadInState(id, allowedFrom);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data: { status: 'disapproved', disapprovedReason: reason } });
    // Mirror onto the allocation if one exists (spec §6.1).
    await tx.fuelAllocation.updateMany({ where: { tripTicketId: id }, data: { status: 'disapproved' } });
  });
  return findTripTicketById(id);
}

// cancel (owning requester or admin; from either pending state).
export async function cancel(id: string, actor: AuthenticatedUser, reason: string) {
  const ticket = await loadInState(id, ['pending_admin_approval', 'pending_fuel_allocation_approval']);
  if (actor.role !== 'admin' && ticket.requestedById !== actor.id) {
    throw new AppError(403, 'NOT_TICKET_OWNER', 'You may only cancel your own trip ticket');
  }
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data: { status: 'cancelled', cancellationReason: reason } });
    await tx.fuelAllocation.updateMany({ where: { tripTicketId: id }, data: { status: 'cancelled' } });
  });
  return findTripTicketById(id);
}

// security_guard check-out → in_progress; records the pre-trip guard and flips
// the vehicle available→on_trip (skipped+logged if it isn't available).
export async function checkOut(id: string, actor: AuthenticatedUser) {
  const ticket = await loadInState(id, ['approved']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: {
        status: 'in_progress',
        preTripGuardId: actor.id,
        preTripCheckedById: actor.id,
        preTripCheckedAt: new Date()
      }
    });
    await changeVehicleStatus(tx, ticket.vehicleId, 'on_trip', {
      changedBy: actor.id,
      source: 'trip_check_out',
      expectedFrom: 'available'
    });
  });
  return findTripTicketById(id);
}

// security_guard check-in → completed; records the post-trip guard and flips
// the vehicle on_trip→available (skipped+logged if it isn't on_trip).
export async function checkIn(id: string, actor: AuthenticatedUser) {
  const ticket = await loadInState(id, ['in_progress']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: {
        status: 'completed',
        postTripGuardId: actor.id,
        postTripCheckedById: actor.id,
        postTripCheckedAt: new Date()
      }
    });
    await changeVehicleStatus(tx, ticket.vehicleId, 'available', {
      changedBy: actor.id,
      source: 'trip_check_in',
      expectedFrom: 'on_trip'
    });
  });
  return findTripTicketById(id);
}
