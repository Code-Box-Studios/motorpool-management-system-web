import type {
  ApproveTripTicketBody,
  CheckInBody,
  CheckOutBody
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import {
  advanceOdometer,
  changeVehicleStatus,
  claimVehicleStatus
} from '../vehicles/status.js';
import * as events from '../notifications/events.js';
import { findTripTicketById } from './repository.js';
import {
  recomputeTicketSpan,
  resolveOutingForCheckIn,
  resolveOutingForCheckOut,
  syncTicketStatus
} from './dates.js';

// Loads the ticket and asserts its current status is in the allowed-from set.
async function loadInState(id: string, allowedFrom: string[]) {
  const ticket = await prisma.tripTicket.findUnique({ where: { id } });
  if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  if (!allowedFrom.includes(ticket.status)) {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Not allowed from status ${ticket.status}`
    );
  }
  return ticket;
}

// admin approve → pending_fuel_allocation_approval; creates the fuel allocation
// (copies vehicleId, backfills branchId, requestedById = approving admin,
// status pending). One transaction.
export async function approve(
  id: string,
  actor: AuthenticatedUser,
  body: ApproveTripTicketBody
) {
  const ticket = await loadInState(id, ['pending_admin_approval']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: {
        status: 'pending_fuel_allocation_approval',
        approvedByAdminId: actor.id
      }
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
  await events.tripApprovedByAdmin(ticket, actor);
  return findTripTicketById(id);
}

// evp approve → approved; stamps the allocation.
export async function approveEvp(id: string, actor: AuthenticatedUser) {
  const ticket = await loadInState(id, ['pending_fuel_allocation_approval']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data: { status: 'approved' } });
    await tx.fuelAllocation.update({
      where: { tripTicketId: id },
      data: { status: 'approved', approvedByEvpId: actor.id }
    });
  });
  await events.tripApprovedByEvp(ticket, actor);
  return findTripTicketById(id);
}

// disapprove (admin from both pending states; evp from the fuel-pending state).
export async function disapprove(
  id: string,
  actor: AuthenticatedUser,
  reason: string
) {
  const allowedFrom =
    actor.role === 'evp_operations'
      ? ['pending_fuel_allocation_approval']
      : ['pending_admin_approval', 'pending_fuel_allocation_approval'];
  const ticket = await loadInState(id, allowedFrom);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: { status: 'disapproved', disapprovedReason: reason }
    });
    // Mirror onto the allocation if one exists (spec §6.1).
    await tx.fuelAllocation.updateMany({
      where: { tripTicketId: id },
      data: { status: 'disapproved' }
    });
  });
  await events.tripDisapproved(ticket, actor, reason);
  return findTripTicketById(id);
}

// cancel (owning requester or admin). Also legal from `approved`: a trip that is
// signed off but no longer needed had no way out at all — the only exits were to
// delete the record outright, or to have the guard check out and check back in a
// trip that never happened.
export async function cancel(
  id: string,
  actor: AuthenticatedUser,
  reason: string
) {
  const ticket = await loadInState(id, [
    'pending_admin_approval',
    'pending_fuel_allocation_approval',
    'approved'
  ]);
  if (actor.role !== 'admin' && ticket.requestedById !== actor.id) {
    throw new AppError(
      403,
      'NOT_TICKET_OWNER',
      'You may only cancel your own trip ticket'
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: { status: 'cancelled', cancellationReason: reason }
    });
    await tx.fuelAllocation.updateMany({
      where: { tripTicketId: id },
      data: { status: 'cancelled' }
    });
  });
  await events.tripCancelled(ticket, actor, reason);
  return findTripTicketById(id);
}

/**
 * Cancel ONE outing. Legal from `scheduled` only: an outing already out must be
 * checked back in, or the van never returns to `available`. Freeing this window
 * makes it bookable again — assertBookable ignores cancelled rows.
 *
 * Only legal while the TICKET itself is `approved` or `in_progress` —
 * deliberately NARROWER than whole-ticket `cancel` above, which also allows
 * the two pending states. `deriveTicketStatus` leaves a pre-approval ticket's
 * status untouched (the approval chain owns it then), so admitting a pending
 * ticket here would let its dates be cancelled down to zero live rows;
 * `service.update()` then derives its proposed dates from the ticket's own
 * non-cancelled rows, and an empty list throws 400 NO_TRIP_DATES on the next,
 * otherwise unrelated, edit. Before approval the right move is to edit the
 * ticket's `dates` outright, or cancel the whole ticket.
 */
export async function cancelDate(
  ticketId: string,
  dateId: string,
  actor: AuthenticatedUser,
  reason: string
) {
  const ticket = await loadInState(ticketId, ['approved', 'in_progress']);
  if (actor.role !== 'admin' && ticket.requestedById !== actor.id) {
    throw new AppError(
      403,
      'NOT_TICKET_OWNER',
      'You may only cancel your own trip ticket'
    );
  }

  const outing = await prisma.tripDate.findFirst({
    where: { id: dateId, tripTicketId: ticketId }
  });
  if (!outing) throw new AppError(404, 'NOT_FOUND', 'Trip date not found');
  if (outing.status !== 'scheduled') {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Not allowed from status ${outing.status}`
    );
  }

  let ticketCancelled = false;
  await prisma.$transaction(async (tx) => {
    await tx.tripDate.update({
      where: { id: dateId },
      data: { status: 'cancelled', cancellationReason: reason }
    });
    await syncTicketStatus(tx, ticketId);
    await recomputeTicketSpan(tx, ticketId);

    // If cancelling this date settled every date on the ticket with none of
    // them completed, syncTicketStatus just derived the TICKET itself to
    // `cancelled` — the event is over, not just this date, so it must settle
    // exactly like a whole-ticket cancellation: its own reason recorded (or a
    // reader opening it later sees "cancelled" with no explanation) AND the
    // allocation cancelled alongside it, mirroring `cancel` above. The "must
    // not touch the FuelAllocation" constraint governs the NON-terminal case
    // only — one date off, the rest of the event still live, the single
    // approval and allocation stand untouched — not this one, where the
    // ticket itself is terminating and `cancelled` is a dead end nothing
    // later corrects.
    const settled = await tx.tripTicket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { status: true }
    });
    if (settled.status === 'cancelled') {
      ticketCancelled = true;
      await tx.tripTicket.update({
        where: { id: ticketId },
        data: { cancellationReason: reason }
      });
      await tx.fuelAllocation.updateMany({
        where: { tripTicketId: ticketId },
        data: { status: 'cancelled' }
      });
    }
  });

  const full = await findTripTicketById(ticketId);
  // Same terminal-vs-not distinction as above: once the ticket itself has
  // gone `cancelled` the whole event is over, not just this date, so this
  // tells people that directly rather than naming a date that no longer
  // matters on its own.
  if (ticketCancelled) {
    await events.tripCancelled(full!, actor, reason);
  } else {
    await events.tripDateCancelled(full!, outing, actor, reason);
  }
  return full;
}

// security_guard (or admin, standing in) check-out → in_progress; records the
// pre-trip guard and the odometer, and flips the vehicle available→on_trip.
//
// The vehicle MUST be available. This used to be a soft `expectedFrom` that
// skipped the flip and let the check-out succeed anyway, which meant a guard
// could release a van sitting in the workshop, and a second trip could check out
// a van already on the road — leaving two trips live on one vehicle.
export async function checkOut(
  id: string,
  actor: AuthenticatedUser,
  body: CheckOutBody
) {
  // Fix round 1: a two-date ticket IS `approved` again between outings
  // (syncTicketStatus drops it back once the first date's check-in leaves a
  // later date still scheduled — see the "does NOT complete..." test below),
  // so widening this to also accept `in_progress` was unnecessary, not
  // required. Worse, it was actively wrong: `in_progress` on the ticket means
  // some date on it is ALREADY checked out, and the only legitimate next gate
  // action for that ticket is closing that outing, not opening another one.
  // Admitting `in_progress` here let a second check-out proceed whenever the
  // vehicle had been flipped back to `available` out of band (a job-order
  // source can do that via `changeVehicleStatus`), which would leave a SECOND
  // TripDate row `in_progress` — and `resolveOutingForCheckIn` only ever
  // closes the earliest one, permanently stranding the second and pinning the
  // ticket at `in_progress` forever. `['approved']` alone is correct: it
  // refuses with INVALID_TRANSITION ("check the van back in first") exactly
  // when a date is already out.
  const ticket = await loadInState(id, ['approved']);
  await prisma.$transaction(async (tx) => {
    const outing = await resolveOutingForCheckOut(tx, id);
    // Claim the van FIRST: the conditional flip is what makes two simultaneous
    // check-outs impossible. A read-then-write let both read `available`.
    const { mileage } = await claimVehicleStatus(
      tx,
      ticket.vehicleId,
      ['available'],
      'on_trip',
      {
        changedBy: actor.id,
        source: 'trip_check_out',
        code: 'VEHICLE_NOT_AVAILABLE',
        message: (current) =>
          `Vehicle is ${current}, so it cannot leave the gate`
      }
    );
    await advanceOdometer(tx, ticket.vehicleId, body.startMileage, mileage);
    // The per-outing facts (odometer, guard stamps, status) now live on the
    // TripDate row, not the ticket — the ticket's own status/mileage/guard
    // columns are deprecated and no longer written (see dates.ts).
    await tx.tripDate.update({
      where: { id: outing.id },
      data: {
        status: 'in_progress',
        startMileage: body.startMileage,
        preTripGuardId: actor.id,
        preTripCheckedById: actor.id,
        preTripCheckedAt: new Date()
      }
    });
    await syncTicketStatus(tx, id);
  });
  await events.tripCheckedOut(ticket, actor);
  return findTripTicketById(id);
}

// security_guard (or admin, standing in) check-in → completed; records the
// post-trip guard and the closing odometer, and flips on_trip→available.
//
// The status flip stays SOFT here, deliberately: the van is physically back
// whatever the row says, and if a job order took it into the workshop mid-trip
// we must not flip it to `available` on top of that. But the trip still closes
// and the odometer still advances.
export async function checkIn(
  id: string,
  actor: AuthenticatedUser,
  body: CheckInBody
) {
  const ticket = await loadInState(id, ['in_progress']);
  await prisma.$transaction(async (tx) => {
    const outing = await resolveOutingForCheckIn(tx, id);
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: ticket.vehicleId },
      select: { mileage: true }
    });
    // Floor at whatever the guard read on the way out, so a trip can never
    // record a negative distance.
    const floor = Math.max(vehicle.mileage, outing.startMileage ?? 0);
    await advanceOdometer(tx, ticket.vehicleId, body.endMileage, floor);
    // Per-outing facts land on the TripDate row — see the note in checkOut.
    await tx.tripDate.update({
      where: { id: outing.id },
      data: {
        status: 'completed',
        endMileage: body.endMileage,
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
    await syncTicketStatus(tx, id);
  });
  await events.tripCheckedIn(ticket, actor);
  return findTripTicketById(id);
}
