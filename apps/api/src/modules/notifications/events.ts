import type { TripTicket, TripDate, JobOrder } from '@prisma/client';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { prisma } from '../../lib/prisma.js';
import { formatDisplayDate } from '../../lib/timezone.js';
import { adminIds, evpIds, notify, userIdForDriver } from './service.js';

// The reference people actually quote to each other — matches the web's
// formatRef('TT' | 'JO', n), so a notification and a screen name the same row
// the same way.
const ref = (prefix: string, n: number | null | undefined) =>
  n == null ? prefix : `${prefix}-${n}`;

const tripLink = (id: string) => `/trip-tickets/${id}`;
const jobOrderLink = (id: string) => `/job-order/${id}`;

// A trip leaving `pending_fuel_allocation_approval` — by any route — has left
// the EVP queue. They were holding it for signature, so they are told it is gone
// whoever removed it. The ticket handed to these functions is the PRE-update
// row, which is what makes reading the outgoing status possible at all.
const wasAwaitingEvp = (ticket: TripTicket) =>
  ticket.status === 'pending_fuel_allocation_approval';

// ---------- Trip tickets ----------

/** A requester submitted a trip — every admin has something to approve. */
export async function tripSubmitted(
  ticket: TripTicket,
  actor: AuthenticatedUser
) {
  await notify({
    userIds: await adminIds(),
    exceptUserId: actor.id,
    type: 'trip_awaiting_approval',
    title: `${ref('TT', ticket.ticketNo)} needs your approval`,
    body: `${ticket.destination} — ${ticket.purpose}`,
    linkTo: tripLink(ticket.id)
  });
  // An admin may raise a trip in somebody else's name (see service.create). That
  // person owns it and otherwise has no way of knowing it exists — while a
  // requester raising their own is the actor, so hears nothing extra.
  await notify({
    userIds: [ticket.requestedById],
    exceptUserId: actor.id,
    type: 'trip_submitted',
    title: `${ref('TT', ticket.ticketNo)} was raised in your name`,
    body: `${ticket.destination} — waiting on admin approval.`,
    linkTo: tripLink(ticket.id)
  });
}

/** Admin approved and allocated fuel — now it is the EVP's to sign off, and the
 *  requester should know it moved rather than watching a stale status. */
export async function tripApprovedByAdmin(
  ticket: TripTicket,
  actor: AuthenticatedUser
) {
  await notify({
    userIds: await evpIds(),
    exceptUserId: actor.id,
    type: 'trip_awaiting_approval',
    title: `${ref('TT', ticket.ticketNo)} awaits your fuel sign-off`,
    body: `${ticket.destination} — approved by an admin`,
    linkTo: tripLink(ticket.id)
  });
  await notify({
    userIds: [ticket.requestedById],
    exceptUserId: actor.id,
    type: 'trip_approved',
    title: `${ref('TT', ticket.ticketNo)} approved by admin`,
    body: 'Waiting on EVP for the fuel allocation.',
    linkTo: tripLink(ticket.id)
  });
}

/** EVP signed off — the trip is really on, so the requester AND the driver who
 *  has to make it both need telling. */
export async function tripApprovedByEvp(
  ticket: TripTicket,
  actor: AuthenticatedUser
) {
  const driverUserId = await userIdForDriver(ticket.driverId);
  // How many outings the driver is actually taking on — a two-date event means
  // two separate gate cycles, not one, and the QR gets shown at each.
  const dateCount = await prisma.tripDate.count({
    where: { tripTicketId: ticket.id, status: { not: 'cancelled' } }
  });
  await notify({
    userIds: [ticket.requestedById],
    exceptUserId: actor.id,
    type: 'trip_approved',
    title: `${ref('TT', ticket.ticketNo)} is approved`,
    body: `${ticket.destination} — fuel allocated. You are good to go.`,
    linkTo: tripLink(ticket.id)
  });
  await notify({
    userIds: [driverUserId],
    exceptUserId: actor.id,
    type: 'trip_assigned',
    title: `You are driving ${ref('TT', ticket.ticketNo)}`,
    body:
      dateCount > 1
        ? `${ticket.destination} — ${dateCount} outings. Show your QR at the gate each time.`
        : `${ticket.destination} — show your QR at the gate.`,
    linkTo: tripLink(ticket.id)
  });
}

/**
 * Declined. The reason IS the notification — it is the only explanation the
 * requester ever gets.
 *
 * The admin who approved it hears too: an EVP declining a trip an admin already
 * signed off is that decision being overturned, and they had no way of finding
 * out. `approvedByAdminId` is null when an admin declines from the first pending
 * state, and a null recipient is simply dropped.
 */
export async function tripDisapproved(
  ticket: TripTicket,
  actor: AuthenticatedUser,
  reason: string
) {
  await notify({
    userIds: [
      ticket.requestedById,
      ticket.approvedByAdminId,
      ...(wasAwaitingEvp(ticket) ? await evpIds() : [])
    ],
    exceptUserId: actor.id,
    type: 'trip_disapproved',
    title: `${ref('TT', ticket.ticketNo)} was declined`,
    body: reason,
    linkTo: tripLink(ticket.id)
  });
}

/**
 * Cancelled. Who hears depends on who did it: an admin cancelling owes the
 * requester an explanation, a requester cancelling frees the admins' queue.
 *
 * The DRIVER is the one this matters most to. Cancelling is legal from
 * `approved` — by which point they have been told "You are driving TT-12" — so
 * without this they turn up at the gate for a trip that no longer exists.
 */
export async function tripCancelled(
  ticket: TripTicket,
  actor: AuthenticatedUser,
  reason: string
) {
  const driverUserId = await userIdForDriver(ticket.driverId);
  // Filtered so a driver who is also the requester gets the pointed message
  // below rather than two rows saying much the same thing.
  const others = [
    ticket.requestedById,
    ...(await adminIds()),
    ...(wasAwaitingEvp(ticket) ? await evpIds() : [])
  ].filter((id) => id !== driverUserId);

  await notify({
    userIds: others,
    exceptUserId: actor.id,
    type: 'trip_cancelled',
    title: `${ref('TT', ticket.ticketNo)} was cancelled`,
    body: reason,
    linkTo: tripLink(ticket.id)
  });
  await notify({
    userIds: [driverUserId],
    exceptUserId: actor.id,
    type: 'trip_cancelled',
    title: `${ref('TT', ticket.ticketNo)} is cancelled — you are not driving it`,
    body: reason,
    linkTo: tripLink(ticket.id)
  });
}

/**
 * ONE outing on the event was called off — the rest of the ticket stays live.
 * Raises the same `trip_cancelled` type as whole-ticket cancel (spec §8: no
 * distinct type exists for this, and nothing branches on the type to tell the
 * two apart), but not its copy: this has to name WHICH date is gone, or a
 * requester with a two-date event has no way to tell from the notification
 * alone which half still stands.
 *
 * The driver split is the same as `tripCancelled` and for the same reason: by
 * the time a date can be cancelled the ticket is already `approved` or
 * `in_progress`, so the driver has already been told "you are driving
 * TT-20" — without this they turn up for an outing that has been called off,
 * even though the rest of the event still stands.
 *
 * `formatDisplayDate` renders in Asia/Manila, not the host process's zone
 * (UTC in tests and in the cloud) — a morning outing named in UTC would read
 * as the wrong calendar day.
 */
export async function tripDateCancelled(
  ticket: TripTicket,
  outing: TripDate,
  actor: AuthenticatedUser,
  reason: string
) {
  const driverUserId = await userIdForDriver(ticket.driverId);
  const day = formatDisplayDate(outing.startTs);
  // Filtered so a driver who is also the requester gets the pointed message
  // below rather than two rows saying much the same thing.
  const others = [ticket.requestedById, ...(await adminIds())].filter(
    (id) => id !== driverUserId
  );

  await notify({
    userIds: others,
    exceptUserId: actor.id,
    type: 'trip_cancelled',
    title: `${ref('TT', ticket.ticketNo)}: the ${day} date was cancelled`,
    body: reason,
    linkTo: tripLink(ticket.id)
  });
  await notify({
    userIds: [driverUserId],
    exceptUserId: actor.id,
    type: 'trip_cancelled',
    title: `${ref('TT', ticket.ticketNo)}: your ${day} outing is cancelled`,
    body: reason,
    linkTo: tripLink(ticket.id)
  });
}

/**
 * The van actually left the yard for ONE outing. `outing` names which date, so
 * a two-date event's readers know which half of the ticket is on the road
 * rather than assuming the whole thing.
 */
export async function tripCheckedOut(
  ticket: TripTicket,
  outing: TripDate,
  actor: AuthenticatedUser
) {
  const day = formatDisplayDate(outing.startTs);
  await notify({
    userIds: [ticket.requestedById, ...(await adminIds())],
    exceptUserId: actor.id,
    type: 'trip_checked_out',
    title: `${ref('TT', ticket.ticketNo)} left the gate`,
    body: `On the road to ${ticket.destination} (${day}).`,
    linkTo: tripLink(ticket.id)
  });
}

/**
 * And ONE outing came back — which advances the odometer, but only closes the
 * whole TICKET when every date on it is settled (see `deriveTicketStatus` in
 * trip-tickets/dates.ts). `ticketCompleted` is the ticket's status as derived
 * and read back by the caller AFTER `syncTicketStatus`, not re-derived here —
 * this function has no business re-implementing that logic, only reporting
 * it. Saying "Trip completed." while a second date is still scheduled would
 * be simply false.
 */
export async function tripCheckedIn(
  ticket: TripTicket,
  outing: TripDate,
  actor: AuthenticatedUser,
  ticketCompleted: boolean
) {
  const day = formatDisplayDate(outing.startTs);
  await notify({
    userIds: [ticket.requestedById, ...(await adminIds())],
    exceptUserId: actor.id,
    type: 'trip_checked_in',
    title: `${ref('TT', ticket.ticketNo)} is back`,
    body: ticketCompleted
      ? `Returned from ${ticket.destination} (${day}). Trip completed.`
      : `Returned from ${ticket.destination} (${day}). Other dates on this ticket are still scheduled.`,
    linkTo: tripLink(ticket.id)
  });
}

// ---------- Job orders ----------

/** A repair was raised — an admin has to put a mechanic on it. */
export async function jobOrderSubmitted(
  order: JobOrder,
  actor: AuthenticatedUser
) {
  await notify({
    userIds: await adminIds(),
    exceptUserId: actor.id,
    type: 'job_order_awaiting_action',
    title: `${ref('JO', order.orderNo)} needs a mechanic`,
    body: order.incidentDetails ?? 'A repair is waiting to be assigned.',
    linkTo: jobOrderLink(order.id)
  });
  // Same on-behalf case as a trip: an admin may raise the repair for someone.
  await notify({
    userIds: [order.requestedById],
    exceptUserId: actor.id,
    type: 'job_order_awaiting_action',
    title: `${ref('JO', order.orderNo)} was raised in your name`,
    body: order.incidentDetails ?? 'Waiting for a mechanic to be assigned.',
    linkTo: jobOrderLink(order.id)
  });
}

/**
 * Mechanic assigned — the EVP signs the repair off.
 *
 * `mechanicDriverId` is passed rather than read off `order`, because the order
 * handed in here is the PRE-update row: at this point the mechanic exists only
 * in the request body.
 */
export async function jobOrderNoted(
  order: JobOrder,
  actor: AuthenticatedUser,
  mechanicDriverId: string | null | undefined
) {
  await notify({
    userIds: await evpIds(),
    exceptUserId: actor.id,
    type: 'job_order_awaiting_action',
    title: `${ref('JO', order.orderNo)} awaits your sign-off`,
    body: order.incidentDetails ?? 'A mechanic has been assigned.',
    linkTo: jobOrderLink(order.id)
  });
  // The person who has to actually do the work. Without this, the one role the
  // assignment exists for is the only one never told about it.
  await notify({
    userIds: [await userIdForDriver(mechanicDriverId)],
    exceptUserId: actor.id,
    type: 'job_order_awaiting_action',
    title: `${ref('JO', order.orderNo)} is yours to repair`,
    body: order.incidentDetails ?? 'A repair has been assigned to you.',
    linkTo: jobOrderLink(order.id)
  });
  await notify({
    userIds: [order.requestedById],
    exceptUserId: actor.id,
    type: 'job_order_awaiting_action',
    title: `${ref('JO', order.orderNo)} has a mechanic`,
    body: 'The repair is assigned and awaiting sign-off.',
    linkTo: jobOrderLink(order.id)
  });
}

/** Signed off — whoever raised it can stop chasing, and the mechanic may start. */
export async function jobOrderApproved(
  order: JobOrder,
  actor: AuthenticatedUser
) {
  await notify({
    userIds: [
      order.requestedById,
      await userIdForDriver(order.assignedMechanicId),
      ...(await adminIds())
    ],
    exceptUserId: actor.id,
    type: 'job_order_approved',
    title: `${ref('JO', order.orderNo)} was approved`,
    body: 'The repair is signed off and can proceed.',
    linkTo: jobOrderLink(order.id)
  });
}

/**
 * Repair closed. This is the event that puts the van back on the road — it is
 * what flips the vehicle to `available` — so it matters to more people than the
 * paperwork suggests, and it used to notify nobody at all.
 */
export async function jobOrderCompleted(
  order: JobOrder,
  actor: AuthenticatedUser
) {
  await notify({
    userIds: [
      order.requestedById,
      await userIdForDriver(order.assignedMechanicId),
      ...(await adminIds())
    ],
    exceptUserId: actor.id,
    type: 'job_order_completed',
    title: `${ref('JO', order.orderNo)} is repaired`,
    body: 'The repair is closed and the vehicle is available again.',
    linkTo: jobOrderLink(order.id)
  });
}
