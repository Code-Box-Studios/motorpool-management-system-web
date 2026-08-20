import type { Prisma } from '@prisma/client';
import type {
  CreateTripTicketBody,
  TripDateInput,
  TripTicketsListQuery,
  UpdateTripTicketBody
} from '@mms/shared';
import { normaliseTripDates } from '@mms/shared';
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
import { replaceTripDates } from './dates.js';
import * as events from '../notifications/events.js';

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

// Fix round 2, item 3: the double-book message names the offending calendar
// day (spec §5), and this fleet is University of Mindanao — Asia/Manila,
// UTC+8. Formatting in UTC names the wrong day for any trip starting before
// 08:00 UTC (00:00 Manila) — and 08:00-local starts are the normal case here
// (see the briefs' own fixtures), so a UTC slice would be wrong routinely, not
// as an edge case. No date-formatting helper exists yet anywhere in the repo
// (checked apps/api/src/lib, packages/shared, and apps/web — the web list
// views call the browser's own `toLocaleDateString()`, which has no
// server-side equivalent since the API's runtime locale/timezone is whatever
// the host happens to be, not Manila's). `Intl.DateTimeFormat` with an IANA
// zone name is used rather than a manual UTC+8 offset add, so this is correct
// even if Node's default locale/TZ on the host is something else.
const DISPLAY_TIMEZONE = 'Asia/Manila';
function formatDisplayDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

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
  > & { dates?: TripDateInput[] },
  excludeTicketId?: string
): Promise<void> {
  const { vehicleId, driverId } = body;
  const dates = normaliseTripDates(body);

  if (dates.length === 0) {
    throw new AppError(
      400,
      'NO_TRIP_DATES',
      'A trip ticket needs at least one date'
    );
  }

  for (const d of dates) {
    if (d.startTs >= d.endTs) {
      throw new AppError(
        400,
        'INVALID_TRIP_WINDOW',
        'A trip cannot end before it starts'
      );
    }
    // A window that has already closed is not a booking, it is a typo. (The
    // start is deliberately not checked: a trip leaving "now" is normal.)
    if (d.endTs.getTime() < Date.now()) {
      throw new AppError(
        400,
        'TRIP_IN_THE_PAST',
        'A trip cannot be booked entirely in the past'
      );
    }
  }

  // Rows in ONE submission must not overlap each other, or a requester books the
  // same van against itself and no cross-ticket check would ever catch it.
  //
  // Brief defect fix: `noUncheckedIndexedAccess` makes `sorted[i]` and
  // `sorted[i - 1]` both `TripDateInput | undefined`, so the brief's
  // `sorted[i].startTs` does not compile. Binding each pair to a local first
  // narrows them for the compiler and reads the same as the original.
  const sorted = [...dates].sort(
    (a, b) => a.startTs.getTime() - b.startTs.getTime()
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (!prev || !cur) continue; // unreachable: i < sorted.length bounds both
    if (cur.startTs < prev.endTs) {
      throw new AppError(
        409,
        'OVERLAPPING_TRIP_DATES',
        'Two of the dates on this request overlap each other'
      );
    }
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

  // Half-open overlap, now per date row: [a.start, a.end) intersects [b.start, b.end).
  // Cancelled rows are free windows and must not block a rebooking.
  for (const d of dates) {
    const clash = await prisma.tripDate.findFirst({
      where: {
        status: { not: 'cancelled' },
        startTs: { lt: d.endTs },
        endTs: { gt: d.startTs },
        tripTicket: {
          ...(excludeTicketId ? { id: { not: excludeTicketId } } : {}),
          status: { in: [...LIVE_STATUSES] },
          OR: [{ vehicleId }, { driverId }]
        }
      },
      select: {
        startTs: true,
        tripTicket: { select: { ticketNo: true, vehicleId: true } }
      }
    });
    if (!clash) continue;

    const isVehicle = clash.tripTicket.vehicleId === vehicleId;
    const day = formatDisplayDate(clash.startTs);
    throw new AppError(
      409,
      isVehicle ? 'VEHICLE_DOUBLE_BOOKED' : 'DRIVER_DOUBLE_BOOKED',
      `${isVehicle ? 'This vehicle' : 'This driver'} is already booked on ${day} (TT-${clash.tripTicket.ticketNo})`
    );
  }
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

  const dates = normaliseTripDates(body);
  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.tripTicket.create({
      // The legacy pair is still written, but only as the seed of the derived
      // span — replaceTripDates recomputes it from the rows immediately after.
      data: {
        ...body,
        // `dates` on the body is the validated request list, not Prisma's `dates`
        // relation (added in Task 1) — those are shaped differently. Keep it out
        // of the ticket write; replaceTripDates below wires it into the
        // trip_dates rows instead.
        dates: undefined,
        requestedById,
        status: 'pending_admin_approval' // status is never client-chosen
      },
      select: { id: true }
    });
    await replaceTripDates(tx, created.id, dates);
    return created;
  });
  const full = await findTripTicketById(ticket.id);
  // Raised after the row exists, so the admins' bell can never point at nothing.
  await events.tripSubmitted(full!, actor);
  return full;
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
  //
  // Fix round 1: this used to feed `body.startTs/endTs ?? existing.startTs/endTs`
  // into availability. `existing.startTs/endTs` is the ticket's DERIVED SPAN
  // (plan: display/sort only, never booking) — feeding it in here was two bugs
  // at once. (1) A PATCH that actually changed `dates` was never checked
  // against the NEW rows: normaliseTripDates only sees `dates` if it is passed
  // explicitly, so the old code silently validated the STALE span instead and
  // let the new (possibly clashing) rows write through unchecked. (2) A PATCH
  // that changed neither `dates` nor the legacy pair fed the ticket's WHOLE
  // multi-date span in as one continuous window, so editing e.g. `destination`
  // on a 14th-and-18th event falsely clashed with a real booking of the gap
  // day (the 16th) — the exact day this feature exists to keep free.
  //
  // The fix: always build the actual proposed rows and pass them as `dates`,
  // and never pass startTs/endTs at all — normaliseTripDates then never falls
  // back to the ticket's derived span.
  //
  // Fix round 2, item 2 (spec §5): `dates` ABSENT means "not editing dates" —
  // a legal no-op, handled by the existing-rows fallback below. `dates`
  // PRESENT but EMPTY is the caller asking for zero dates on the ticket, which
  // is a validation error exactly like on create — it must not silently fall
  // through to "keep the old rows" and return 200 having changed nothing.
  if (body.dates !== undefined && body.dates.length === 0) {
    throw new AppError(
      400,
      'NO_TRIP_DATES',
      'A trip ticket needs at least one date'
    );
  }

  const proposedDates: TripDateInput[] =
    body.dates && body.dates.length > 0
      ? body.dates
      : body.startTs && body.endTs
        ? [{ startTs: body.startTs, endTs: body.endTs }]
        : // Caller sent neither: re-validate the ticket's OWN existing rows —
          // not its derived span — so an unrelated edit re-checks exactly the
          // windows this ticket already holds. A cancelled row is a free
          // window and must not be re-validated as occupied.
          existing.dates
            .filter((d) => d.status !== 'cancelled')
            .map((d) => ({ startTs: d.startTs, endTs: d.endTs }));

  await assertBookable(
    {
      vehicleId: body.vehicleId ?? existing.vehicleId,
      driverId: body.driverId ?? existing.driverId,
      participants: body.participants ?? existing.participants,
      participantsCount: body.participantsCount ?? existing.participantsCount,
      dates: proposedDates
    },
    id
  );
  // An edit cannot hand the ticket to someone else — that is the same
  // client-controlled attribution hole as on create, via the back door.
  const { requestedById, ...editable } = body;
  // Fix round 2, item 1 (spec §4.2): startTs/endTs are the ticket's DERIVED
  // SPAN, same as `dates` above them — never a real column write from the
  // client. Before this feature they were the truth, so writing them straight
  // from the body was correct; now `recomputeTicketSpan` (via
  // `replaceTripDates`, called inside the SAME transaction below) must be the
  // only writer of these two columns. Leaving them in `editable` let a PATCH
  // carrying just one half of the pair (the real web client's `mapUpdateBody`
  // guards startTs/endTs independently, so a form that dirties only one field
  // sends only one) write a value no TripDate row backs directly onto
  // `TripTicket.startTs`/`endTs` — a lone `startTs` also validated the OLD
  // rows in `proposedDates` above (neither half of the legacy-pair branch is
  // true), so the unvalidated value would have landed silently.
  const data =
    actor.role === 'admin' && requestedById
      ? {
          ...editable,
          dates: undefined,
          startTs: undefined,
          endTs: undefined,
          requestedById
        }
      : { ...editable, dates: undefined, startTs: undefined, endTs: undefined };
  // dates on the body is the validated request list, not Prisma's `dates`
  // relation — see the comment in create() above.

  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data });
    // Only touch the date rows when the caller actually sent dates — a `dates`
    // array with rows, or the legacy startTs/endTs pair. A PATCH that edits only
    // e.g. `destination` sends neither, and must leave the rows untouched.
    const sentDates =
      (body.dates && body.dates.length > 0) || (body.startTs && body.endTs);
    if (sentDates) {
      await replaceTripDates(tx, id, normaliseTripDates(body));
    }
  });
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
