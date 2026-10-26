import type { TripDate } from '@prisma/client';
import type {
  ApproveTripTicketBody,
  CheckInBody,
  CheckOutBody,
  DriverOdometerBody
} from '@mms/shared';
import {
  gateStartingMileage,
  validateDriverReading
} from './odometer-policy.js';
import { AppError } from '../../lib/errors.js';
import { lockDrivers, lockVehicles } from '../../lib/resource-locks.js';
import { assertOrgRefsActive } from '../../lib/org-refs.js';
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
import {
  assertGuideUsersActive,
  assertSeatsFit,
  participantHeadcount,
  replaceTripTicketGuides
} from './guides.js';

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
  const decidedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data: { status: 'approved' } });
    await tx.fuelAllocation.update({
      where: { tripTicketId: id },
      data: {
        status: 'approved',
        approvedByEvpId: actor.id,
        // decidedBy/decidedAt are the history's source (spec §3.1). They overlap
        // with approvedByEvpId on approvals but are written from the same
        // actor.id in the same statement, so they cannot drift. approvedByEvpId
        // stays because the trip-ticket detail screen reads it.
        decidedById: actor.id,
        decidedAt
      }
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
  const decidedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: { status: 'disapproved', disapprovedReason: reason }
    });
    // Mirror onto the allocation if one exists (spec §6.1).
    await tx.fuelAllocation.updateMany({
      where: { tripTicketId: id },
      data: {
        status: 'disapproved',
        // The column has existed since the first migration and nothing wrote it,
        // so a declined allocation could never say why (spec §2).
        disapprovedReason: reason,
        decidedById: actor.id,
        decidedAt
      }
    });
    // ...and onto the outings the refusal terminates. Without this the rows
    // stay `scheduled` on a ticket nobody will ever act on again: they keep
    // holding the vehicle and driver against `assertBookable` (which only
    // excludes `cancelled` rows), and they keep showing on the calendar and
    // the driver's dashboard as trips still to run. `cancelled` is the row-level
    // spelling of "this outing is not happening" — spec §6.2 has no
    // `disapproved` TripDateStatus, and the backfill SQL maps a disapproved
    // ticket's row to `cancelled` for exactly this reason.
    //
    // Only `scheduled` rows. `disapprove` is reachable only from the two
    // pending states so in practice every row is scheduled, but scoping it
    // this way keeps the rule identical to `cancel` below and means a row that
    // somehow got out of the yard is never rewritten out from under the gate.
    await tx.tripDate.updateMany({
      where: { tripTicketId: id, status: 'scheduled' },
      data: { status: 'cancelled', cancellationReason: reason }
    });
    // Deliberately NO syncTicketStatus: `deriveTicketStatus` returns anything
    // other than approved/in_progress untouched, so the ticket keeps the
    // terminal `disapproved` this transition just gave it.
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
    // Scoped to `pending` only (round-4 review #3): an allocation the EVP has
    // already decided is a fact of record — approved or disapproved — and a
    // later cancellation by the requester does not un-make it. Overwriting it
    // to `cancelled` here used to erase it from the approvals-history query
    // (`status IN ('approved','disapproved')`), so an EVP's decision vanished
    // the moment the requester cancelled. The ticket itself still moves to
    // `cancelled` above — that is what the trip's own status is for. An
    // allocation still `pending` (no decision ever made) keeps the old
    // behaviour: it moves to `cancelled` and stays out of the history, same
    // as before.
    await tx.fuelAllocation.updateMany({
      where: { tripTicketId: id, status: 'pending' },
      data: { status: 'cancelled' }
    });
    // Cascade onto the outings this cancellation calls off. `approved` is in
    // the allowed-from set above, and since this branch `approved` no longer
    // means "nothing has happened yet": a two-date event whose first outing has
    // already been driven and closed sits right back at `approved` (see the
    // "does NOT complete the ticket while a later date is still scheduled"
    // test). Without this cascade, whole-cancelling such a ticket left date 1
    // `completed`, date 2 `scheduled` — an outing still holding the van in
    // `assertBookable` and still on the driver's list for a trip that has been
    // called off.
    //
    // ONLY `scheduled` rows. A `completed` outing physically happened — the van
    // went out, the odometer moved, a guard signed it back in — and rewriting it
    // to `cancelled` would erase that record and contradict spec §6.2, which
    // derives a ticket whose rows are all settled with at least one completed to
    // `completed`. (The dashboard figure is safe either way: completedTripsCount
    // counts TICKETS, not date rows, so a cancelled ticket is excluded
    // regardless.) An `in_progress` row is a van currently outside the gate;
    // only check-in may close it, or the vehicle never returns to `available`.
    await tx.tripDate.updateMany({
      where: { tripTicketId: id, status: 'scheduled' },
      data: { status: 'cancelled', cancellationReason: reason }
    });
    // Deliberately NO syncTicketStatus: the admin cancelled the EVENT, and
    // `deriveTicketStatus` returns a `cancelled` ticket untouched, so it keeps
    // the terminal status this transition just gave it — including on the
    // partly-completed case, where re-deriving from the rows would otherwise
    // argue for `completed`.
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

    // A settled fuel decision survives withdrawal. Cancel only an allocation
    // still awaiting a decision, exactly as whole-ticket cancellation does.
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
        where: { tripTicketId: ticketId, status: 'pending' },
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
// pre-trip guard and consumes any driver reading, then flips available→on_trip.
//
// The vehicle MUST be available. This used to be a soft `expectedFrom` that
// skipped the flip and let the check-out succeed anyway, which meant a guard
// could release a van sitting in the workshop, and a second trip could check out
// a van already on the road — leaving two trips live on one vehicle.
export async function checkOut(
  id: string,
  actor: AuthenticatedUser,
  _body: CheckOutBody
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
  assertGateBranch(ticket.branchId, actor);
  // Assigned inside the transaction, read after — the event only needs to name
  // which date, not the transaction's own client.
  let outing!: TripDate;
  await prisma.$transaction(async (tx) => {
    await lockDrivers(tx, [ticket.driverId]);
    await lockVehicles(tx, [ticket.vehicleId]);
    const lockedTicket = await tx.tripTicket.findUniqueOrThrow({
      where: { id }
    });
    if (lockedTicket.status !== 'approved')
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        'Trip is no longer ready for departure'
      );
    const driver = await tx.driver.findUnique({
      where: { id: ticket.driverId }
    });
    if (!driver) throw new AppError(404, 'NOT_FOUND', 'Driver not found');
    if (driver.status === 'inactive') {
      throw new AppError(
        409,
        'DRIVER_INACTIVE',
        `${driver.fullName} is not an active driver`
      );
    }
    // An open outing is the driver claim. Roster status remains independent:
    // being out today must not prevent a nonoverlapping future booking.
    const alreadyOut = await tx.tripDate.findFirst({
      where: {
        status: 'in_progress',
        tripTicket: { driverId: ticket.driverId }
      },
      select: { id: true }
    });
    if (alreadyOut) {
      throw new AppError(
        409,
        'DRIVER_ON_TRIP',
        'This driver is already out on a trip'
      );
    }
    outing = await resolveOutingForCheckOut(tx, id);
    const gateAt = new Date();
    // A future outing's reading may have been entered before another trip
    // returned. Revalidate actual gate chronology before freezing that value.
    const [previousStarts, previousEnds] = await Promise.all([
      tx.tripDate.aggregate({
        where: {
          id: { not: outing.id },
          tripTicket: { vehicleId: ticket.vehicleId },
          preTripCheckedAt: { lte: gateAt }
        },
        _max: { startMileage: true }
      }),
      tx.tripDate.aggregate({
        where: {
          id: { not: outing.id },
          tripTicket: { vehicleId: ticket.vehicleId },
          postTripCheckedAt: { lte: gateAt }
        },
        _max: { endMileage: true }
      })
    ]);
    const priorReadings = [
      previousStarts._max.startMileage,
      previousEnds._max.endMileage
    ].filter((value): value is number => value !== null);
    const precedingGateMileage = priorReadings.length
      ? Math.max(...priorReadings)
      : null;
    const startingMileage = gateStartingMileage(
      outing.startMileage,
      precedingGateMileage
    );
    const invalidatedStart =
      outing.startMileage !== null && startingMileage === null;
    // Claim only an available vehicle after checking the locked driver.
    const { mileage } = await claimVehicleStatus(
      tx,
      ticket.vehicleId,
      ['available'],
      'on_trip',
      {
        changedBy: actor.id,
        source: 'trip_check_out',
        reason: invalidatedStart
          ? JSON.stringify({
              action: 'invalidate_stale_driver_start',
              tripDateId: outing.id,
              mileage: outing.startMileage,
              recordedById: outing.startMileageRecordedById,
              recordedAt: outing.startMileageRecordedAt,
              precedingGateMileage
            })
          : undefined,
        code: 'VEHICLE_NOT_AVAILABLE',
        message: (current) =>
          `Vehicle is ${current}, so it cannot leave the gate`
      }
    );
    if (startingMileage !== null) {
      await advanceOdometer(
        tx,
        ticket.vehicleId,
        Math.max(startingMileage, mileage),
        mileage
      );
    }
    // The per-outing facts (odometer, guard stamps, status) now live on the
    // TripDate row, not the ticket — the ticket's own status/mileage/guard
    // columns are deprecated and no longer written (see dates.ts).
    await tx.tripDate.update({
      where: { id: outing.id },
      data: {
        status: 'in_progress',
        ...(invalidatedStart
          ? {
              startMileage: null,
              startMileageRecordedById: null,
              startMileageRecordedAt: null
            }
          : {}),
        preTripGuardId: actor.id,
        preTripCheckedById: actor.id,
        preTripCheckedAt: gateAt
      }
    });
    await syncTicketStatus(tx, id);
  });
  await events.tripCheckedOut(ticket, outing, actor);
  return findTripTicketById(id);
}

// security_guard (or admin, standing in) check-in → completed; records the
// post-trip guard and consumes any driver reading, then flips on_trip→available.
//
// The status flip stays SOFT here, deliberately: the van is physically back
// whatever the row says, and if a job order took it into the workshop mid-trip
// we must not flip it to `available` on top of that. But the trip still closes
// and the odometer still advances.
export async function checkIn(
  id: string,
  actor: AuthenticatedUser,
  _body: CheckInBody
) {
  const ticket = await loadInState(id, ['in_progress']);
  assertGateBranch(ticket.branchId, actor);
  let outing!: TripDate;
  // Whether THIS check-in settled the whole event, or just this outing — read
  // back from syncTicketStatus's own derivation rather than re-implementing
  // deriveTicketStatus's rules here (see the note on events.tripCheckedIn).
  let ticketCompleted = false;
  await prisma.$transaction(async (tx) => {
    await lockDrivers(tx, [ticket.driverId]);
    await lockVehicles(tx, [ticket.vehicleId]);
    const lockedTicket = await tx.tripTicket.findUniqueOrThrow({
      where: { id }
    });
    if (lockedTicket.status !== 'in_progress')
      throw new AppError(409, 'INVALID_TRANSITION', 'Trip is no longer out');
    outing = await resolveOutingForCheckIn(tx, id);
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: ticket.vehicleId },
      select: { mileage: true }
    });
    // Preserve the vehicle maximum when consuming a recorded driver reading.
    const floor = Math.max(vehicle.mileage, outing.startMileage ?? 0);
    if (outing.endMileage !== null) {
      await advanceOdometer(
        tx,
        ticket.vehicleId,
        Math.max(outing.endMileage, floor),
        vehicle.mileage
      );
    }
    // Per-outing facts land on the TripDate row — see the note in checkOut.
    await tx.tripDate.update({
      where: { id: outing.id },
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
    await syncTicketStatus(tx, id);
    const settled = await tx.tripTicket.findUniqueOrThrow({
      where: { id },
      select: { status: true }
    });
    ticketCompleted = settled.status === 'completed';
  });
  await events.tripCheckedIn(ticket, outing, actor, ticketCompleted);
  return findTripTicketById(id);
}

/**
 * Swap the people guiding an already-approved trip.
 *
 * The generic PATCH is frozen the moment a ticket leaves
 * `pending_admin_approval`, and a guide changing on the morning of the trip is
 * the ordinary case rather than an exception — so guides get their own
 * transition instead of a hole in the freeze.
 *
 * Allowed from `pending_fuel_allocation_approval`, `approved` and
 * `in_progress`. Not from `completed`, `cancelled` or `disapproved`: a finished
 * trip's record of who was on it is history, and rewriting it would make the
 * ticket disagree with what actually happened. Not from
 * `pending_admin_approval` either — the ordinary PATCH already handles guides
 * in that ONE state, and one edit reachable through two doors with two
 * different guards on them is how a freeze stops meaning anything.
 *
 * `pending_fuel_allocation_approval` is in the list because admin approval
 * moves EVERY ticket there (see `approve` above), and PATCH is refused from it
 * (service.ts only allows `pending_admin_approval`). Leaving it out left a dead
 * zone between booking and EVP fuel sign-off in which the guides could not be
 * changed through any door at all — which is not a freeze, just a gap.
 *
 * The seat check runs again: swapping one guide for five can overflow the van.
 * The participant figures come off the STORED ticket, never off the request —
 * this endpoint does not edit participants, and reading them from the body
 * would let a caller shrink the party on paper to make room for the guides
 * they are adding.
 *
 * No `actor` and no notification, unlike the transitions above: this is an
 * admin-only correction to a staffing list, there is no approval decision in it
 * and nobody is holding it for signature. If either changes it takes an
 * AuthenticatedUser and an events.* call like the rest.
 */
export async function reassignGuides(id: string, guideIds: string[]) {
  const ticket = await loadInState(id, [
    'pending_fuel_allocation_approval',
    'approved',
    'in_progress'
  ]);
  await assertGuideUsersActive(guideIds);

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: ticket.vehicleId },
    select: { capacity: true }
  });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  assertSeatsFit(
    vehicle.capacity,
    participantHeadcount(ticket.participants, ticket.participantsCount),
    guideIds.length
  );

  // Deliberately NOT assertBookable: that would re-run the date rules too, and
  // an approved two-date event whose first outing is already driven and closed
  // would fail TRIP_IN_THE_PAST on a request that never touched its dates.
  await prisma.$transaction(async (tx) => {
    // deleteMany + createMany must not half-apply — a failure between them
    // would leave an approved trip with no guides at all.
    await replaceTripTicketGuides(tx, id, guideIds);
  });
  return findTripTicketById(id);
}

function assertGateBranch(branchId: string, actor: AuthenticatedUser): void {
  if (
    actor.role === 'security_guard' &&
    actor.branchId &&
    actor.branchId !== branchId
  ) {
    throw new AppError(
      403,
      'BRANCH_FORBIDDEN',
      'This trip belongs to another branch'
    );
  }
}

/** Driver readings and gate transitions share resource locks to preserve chronology. */
export async function recordOdometer(
  id: string,
  dateId: string,
  actor: AuthenticatedUser,
  body: DriverOdometerBody
) {
  const initial = await prisma.tripTicket.findUnique({ where: { id } });
  if (!initial) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  await prisma.$transaction(async (tx) => {
    await lockDrivers(tx, [initial.driverId]);
    await lockVehicles(tx, [initial.vehicleId]);
    const ticket = await tx.tripTicket.findUniqueOrThrow({ where: { id } });
    if (
      ticket.driverId !== initial.driverId ||
      ticket.vehicleId !== initial.vehicleId
    ) {
      throw new AppError(
        409,
        'ASSIGNMENT_CHANGED',
        'Trip assignment changed; reload before entering mileage'
      );
    }
    const driver = await tx.driver.findUniqueOrThrow({
      where: { id: ticket.driverId }
    });
    if (actor.role !== 'driver' || driver.userId !== actor.id) {
      throw new AppError(
        403,
        'NOT_ASSIGNED_DRIVER',
        'Only the assigned driver can enter odometer readings'
      );
    }
    if (
      driver.status !== 'active' ||
      !['approved', 'in_progress', 'completed'].includes(ticket.status)
    ) {
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        'An active, approved assignment is required'
      );
    }
    const outing = await tx.tripDate.findFirst({
      where: { id: dateId, tripTicketId: id }
    });
    if (!outing) throw new AppError(404, 'NOT_FOUND', 'Trip date not found');
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: ticket.vehicleId }
    });
    // For a pending departure, this is its future gate event. For late entry,
    // actual gate stamps, rather than the planned dates, define its neighbors.
    const eventAt =
      body.phase === 'before'
        ? (outing.preTripCheckedAt ?? new Date())
        : (outing.postTripCheckedAt ?? new Date());
    const neighbors = await tx.tripDate.findMany({
      where: {
        id: { not: dateId },
        tripTicket: { vehicleId: ticket.vehicleId },
        preTripCheckedAt: { not: null }
      },
      select: {
        preTripCheckedAt: true,
        postTripCheckedAt: true,
        startMileage: true,
        endMileage: true
      }
    });
    let preceding: number | null = null;
    let following: number | null = null;
    let laterDeparture = false;
    for (const other of neighbors) {
      if (
        outing.preTripCheckedAt &&
        other.preTripCheckedAt! > outing.preTripCheckedAt
      )
        laterDeparture = true;
      for (const [stamp, reading] of [
        [other.preTripCheckedAt, other.startMileage],
        [other.postTripCheckedAt, other.endMileage]
      ] as const) {
        if (!stamp || reading === null) continue;
        if (stamp <= eventAt)
          preceding =
            preceding === null ? reading : Math.max(preceding, reading);
        else
          following =
            following === null ? reading : Math.min(following, reading);
      }
    }
    validateDriverReading(
      outing,
      body.phase,
      body.mileage,
      vehicle.mileage,
      preceding,
      following,
      laterDeparture
    );
    const recordedAt = new Date();
    await tx.tripDate.update({
      where: { id: dateId },
      data:
        body.phase === 'before'
          ? {
              startMileage: body.mileage,
              startMileageRecordedById: actor.id,
              startMileageRecordedAt: recordedAt
            }
          : {
              endMileage: body.mileage,
              endMileageRecordedById: actor.id,
              endMileageRecordedAt: recordedAt
            }
    });
    await advanceOdometer(
      tx,
      ticket.vehicleId,
      Math.max(vehicle.mileage, body.mileage),
      vehicle.mileage
    );
  });
  return findTripTicketById(id);
}
