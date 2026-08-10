import type { Prisma } from '@prisma/client';
import type {
  CreateTripTicketBody,
  TripTicketsListQuery,
  UpdateTripTicketBody
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { toOrderBy } from '../../lib/sorting.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findDriverByUserId } from '../drivers/repository.js';
import {
  findTripTicketById,
  listTripTickets,
  tripTicketInclude
} from './repository.js';

// Builds the visibility filter for a caller (spec §5): requester → own;
// driver → own trips (via drivers.userId); admin/evp/guard → unfiltered.
async function scopeFor(
  actor: AuthenticatedUser
): Promise<Prisma.TripTicketWhereInput> {
  if (actor.role === 'requester') return { requestedById: actor.id };
  if (actor.role === 'driver') {
    const driver = await findDriverByUserId(actor.id);
    // No linked driver row → sees nothing (a uuid that can't match any driverId).
    return { driverId: driver?.id ?? '00000000-0000-4000-8000-000000000000' };
  }
  return {};
}

export async function list(
  query: TripTicketsListQuery,
  actor: AuthenticatedUser
) {
  const scope = await scopeFor(actor);
  const filters: Prisma.TripTicketWhereInput = {
    ...(query.requestedBy ? { requestedById: query.requestedBy } : {}),
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.driverId ? { driverId: query.driverId } : {}),
    ...(query.status ? { status: query.status } : {})
  };
  // AND the caller's scope with the client filters — NEVER merge them by spread,
  // or a requester/driver ?requestedBy=/?driverId= filter would OVERWRITE the
  // scope key and read others' tickets (spec §5 IDOR). AND keeps scope binding:
  // admin/evp/guard scope is {} so their filters apply unchanged.
  const where: Prisma.TripTicketWhereInput = { AND: [scope, filters] };
  const orderBy = toOrderBy<Prisma.TripTicketOrderByWithRelationInput>(
    query.sortBy,
    query.sortOrder,
    {
      ticketNo: (order) => ({ ticketNo: order }),
      destination: (order) => ({ destination: order }),
      purpose: (order) => ({ purpose: order }),
      startTs: (order) => ({ startTs: order }),
      endTs: (order) => ({ endTs: order }),
      status: (order) => ({ status: order })
    },
    { updatedAt: 'desc' }
  );
  return listTripTickets(where, toSkipTake(query), orderBy);
}

export async function getById(id: string, actor: AuthenticatedUser) {
  const ticket = await findTripTicketById(id);
  if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  // Enforce the same scoping on the detail read (not-found masking).
  if (actor.role === 'requester' && ticket.requestedById !== actor.id) {
    throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  }
  if (actor.role === 'driver') {
    const driver = await findDriverByUserId(actor.id);
    if (!driver || ticket.driverId !== driver.id)
      throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  }
  return ticket;
}

// A trip that has not reached a terminal state still holds its vehicle and its
// driver. Completed / cancelled / disapproved trips release both.
const LIVE_STATUSES = [
  'pending_admin_approval',
  'pending_fuel_allocation_approval',
  'approved',
  'in_progress'
] as const;

// Nothing checked any of this before: a trip could be booked on a van that was
// out of service, could end before it started, and the same van (and the same
// driver) could be booked twice over for the same hours — right through to the
// guard checking BOTH trips out.
async function assertBookable(
  body: Pick<
    CreateTripTicketBody,
    | 'vehicleId'
    | 'driverId'
    | 'startTs'
    | 'endTs'
    | 'participants'
    | 'participantsCount'
  >,
  excludeTicketId?: string
): Promise<void> {
  const { vehicleId, driverId, startTs, endTs } = body;

  if (startTs && endTs && startTs >= endTs) {
    throw new AppError(
      400,
      'INVALID_TRIP_WINDOW',
      'A trip cannot end before it starts'
    );
  }
  // A trip whose window has already closed is not a booking, it is a typo. (The
  // start is deliberately not checked: a trip leaving "now" is normal, and a few
  // milliseconds of clock skew must not reject it.)
  if (endTs && endTs.getTime() < Date.now()) {
    throw new AppError(
      400,
      'TRIP_IN_THE_PAST',
      'A trip cannot be booked entirely in the past'
    );
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { status: true, capacity: true }
  });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  // Only out_of_service is refused outright. `under_maintenance` is not: a van in
  // the workshop today can legitimately be booked for a trip next month — and the
  // guard's check-out is the gate that refuses to release it if it is still in
  // there on the day.
  if (vehicle.status === 'out_of_service') {
    throw new AppError(
      409,
      'VEHICLE_OUT_OF_SERVICE',
      'This vehicle is out of service'
    );
  }

  // The names are the truth; the count is a claim about them. If both are given
  // they have to agree, or the headcount the vehicle is sized against is fiction.
  const named = body.participants?.length ?? 0;
  const claimed = body.participantsCount ?? null;
  if (claimed !== null && named > 0 && claimed !== named) {
    throw new AppError(
      400,
      'PARTICIPANTS_MISMATCH',
      `${named} participant name(s) given but the count says ${claimed}`
    );
  }
  const headcount = Math.max(named, claimed ?? 0);
  if (headcount > vehicle.capacity) {
    throw new AppError(
      409,
      'OVER_CAPACITY',
      `That vehicle seats ${vehicle.capacity}; the trip is for ${headcount}`
    );
  }

  // An inactive driver is off the roster. (`on_trip` is fine — that is a driver's
  // state right NOW, and it says nothing about a trip next week.)
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { status: true, fullName: true }
  });
  if (!driver) throw new AppError(404, 'NOT_FOUND', 'Driver not found');
  if (driver.status === 'inactive') {
    throw new AppError(
      409,
      'DRIVER_INACTIVE',
      `${driver.fullName} is not an active driver`
    );
  }

  // Overlap is only meaningful when the trip has a window at all.
  if (!startTs || !endTs) return;

  // Half-open overlap: [a.start, a.end) intersects [b.start, b.end).
  const clash = await prisma.tripTicket.findFirst({
    where: {
      ...(excludeTicketId ? { id: { not: excludeTicketId } } : {}),
      status: { in: [...LIVE_STATUSES] },
      startTs: { lt: endTs },
      endTs: { gt: startTs },
      OR: [{ vehicleId }, { driverId }]
    },
    select: { id: true, ticketNo: true, vehicleId: true }
  });
  if (!clash) return;

  const isVehicle = clash.vehicleId === vehicleId;
  throw new AppError(
    409,
    isVehicle ? 'VEHICLE_DOUBLE_BOOKED' : 'DRIVER_DOUBLE_BOOKED',
    `${isVehicle ? 'This vehicle' : 'This driver'} is already booked for an overlapping trip (TT-${clash.ticketNo})`
  );
}

export async function create(
  body: CreateTripTicketBody,
  actor: AuthenticatedUser
) {
  await assertBookable(body);
  // WHO ASKED is the authenticated caller — not a field the client fills in. It
  // used to be spread straight out of the body, so a requester could book a trip
  // in the admin's name, or with `requestedById: null` and no owner at all — and
  // since cancel/edit compare against that column, an unowned ticket locked
  // everyone but an admin out of it forever.
  //
  // An admin raising a ticket on someone's behalf is a real workflow, so they may
  // still name the requester. Nobody else can.
  const requestedById =
    actor.role === 'admin' && body.requestedById
      ? body.requestedById
      : actor.id;

  return prisma.tripTicket.create({
    data: { ...body, requestedById, status: 'pending_admin_approval' }, // status is never client-chosen
    include: tripTicketInclude
  });
}

export async function update(
  id: string,
  body: UpdateTripTicketBody,
  actor: AuthenticatedUser
) {
  const existing = await findTripTicketById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  if (actor.role !== 'admin' && existing.requestedById !== actor.id) {
    throw new AppError(
      403,
      'NOT_TICKET_OWNER',
      'You may only edit your own trip ticket'
    );
  }
  if (existing.status !== 'pending_admin_approval') {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      'Trip ticket can only be edited while pending admin approval'
    );
  }
  // An edit can move the trip onto another vehicle, another driver, other hours,
  // or a bigger party, so it has to clear the same bar a new booking does.
  await assertBookable(
    {
      vehicleId: body.vehicleId ?? existing.vehicleId,
      driverId: body.driverId ?? existing.driverId,
      startTs: body.startTs ?? existing.startTs,
      endTs: body.endTs ?? existing.endTs,
      participants: body.participants ?? existing.participants,
      participantsCount: body.participantsCount ?? existing.participantsCount
    },
    id
  );
  // An edit cannot hand the ticket to someone else — that is the same
  // client-controlled attribution hole as on create, via the back door.
  const { requestedById, ...editable } = body;
  const data =
    actor.role === 'admin' && requestedById
      ? { ...editable, requestedById }
      : editable;

  await prisma.tripTicket.update({ where: { id }, data });
  return findTripTicketById(id);
}

export async function remove(id: string): Promise<void> {
  const existing = await findTripTicketById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  // Delete is for a draft nobody has acted on. The moment an admin approves, a
  // fuel allocation exists and the EVP may have signed it off; the moment a guard
  // touches it, the trip physically happened. Deleting any of those cascades the
  // fuel allocation away with the ticket and erases an approved spend from the
  // books. Everything past the first step has an off-ramp — cancel or disapprove
  // — which leaves the record and the reason behind.
  if (existing.status !== 'pending_admin_approval') {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Cannot delete a trip ticket that is ${existing.status} — cancel it instead`
    );
  }
  await prisma.tripTicket.delete({ where: { id } }); // fuel_allocation cascades (schema onDelete: Cascade)
}

export { scopeFor };
