// Brief defect #4: the brief's snippet added a second `import type ... from
// '@prisma/client'` for `TripDateStatus`/`TripTicketStatus` alongside this
// file's existing `Prisma` import — merged into one import instead.
import type { Prisma, TripDateStatus, TripTicketStatus } from '@prisma/client';
import type { TripDateInput } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { endOfDisplayDay } from '../../lib/timezone.js';

/**
 * Recompute the ticket's derived span from its date rows.
 *
 * The span is display and sort only — the list orders on it and the dashboards
 * read it — so it must never drift from the rows underneath. Cancelled rows are
 * excluded: a cancelled 21st should not keep stretching the event to the 21st.
 * A ticket whose rows are all cancelled keeps its last span rather than going
 * null, because a null span sorts unpredictably in every list that reads it.
 */
export async function recomputeTicketSpan(
  tx: Prisma.TransactionClient,
  tripTicketId: string
): Promise<void> {
  const live = await tx.tripDate.findMany({
    where: { tripTicketId, status: { not: 'cancelled' } },
    select: { startTs: true, endTs: true },
    orderBy: { startTs: 'asc' }
  });
  // Brief defect fix: `noUncheckedIndexedAccess` types `live[0]` as
  // `{ startTs; endTs } | undefined` even right after the length check above —
  // TypeScript does not narrow an index expression from a `.length` guard.
  // Destructuring the first element and checking it directly narrows it instead.
  const [first, ...rest] = live;
  if (!first) return;

  const startTs = first.startTs;
  const endTs = rest.reduce(
    (latest, d) => (d.endTs > latest ? d.endTs : latest),
    first.endTs
  );
  await tx.tripTicket.update({
    where: { id: tripTicketId },
    data: { startTs, endTs }
  });
}

/**
 * Replace a ticket's date rows wholesale.
 *
 * Only legal while the ticket is still pending — `update` enforces that — so
 * deleting the old rows cannot discard an odometer reading or a guard stamp.
 *
 * An EMPTY list is refused rather than obeyed. On its own each half is
 * defensible — `recomputeTicketSpan` deliberately keeps the last span when no
 * live rows remain, because a null span sorts unpredictably in every list that
 * reads it — but together they are a trap: an empty replace deletes every row
 * and then lands in exactly that early return, leaving a ticket with no dates
 * and a stale span that still claims one, with no error anywhere. Both callers
 * (`create` and `update` in service.ts) already reject a request with no dates
 * before reaching here, so this can only fire on a future caller that forgot.
 */
export async function replaceTripDates(
  tx: Prisma.TransactionClient,
  tripTicketId: string,
  dates: TripDateInput[]
): Promise<void> {
  if (dates.length === 0) {
    throw new AppError(
      400,
      'NO_TRIP_DATES',
      'A trip ticket must keep at least one date'
    );
  }
  await tx.tripDate.deleteMany({ where: { tripTicketId } });
  await tx.tripDate.createMany({
    data: dates.map((d) => ({
      tripTicketId,
      startTs: d.startTs,
      endTs: d.endTs
    }))
  });
  await recomputeTicketSpan(tx, tripTicketId);
}

/**
 * The ticket's status after approval is a function of its dates.
 *
 * Before approval the approval chain owns the status outright and the dates say
 * nothing about it — which is why anything other than approved/in_progress is
 * returned untouched. Rules are first-match-wins; a date is SETTLED when it is
 * completed or cancelled.
 */
export function deriveTicketStatus(
  current: TripTicketStatus,
  dates: { status: TripDateStatus }[]
): TripTicketStatus {
  if (current !== 'approved' && current !== 'in_progress') return current;
  if (dates.length === 0) return current;
  if (dates.some((d) => d.status === 'in_progress')) return 'in_progress';
  const settled = dates.every(
    (d) => d.status === 'completed' || d.status === 'cancelled'
  );
  if (!settled) return 'approved';
  return dates.some((d) => d.status === 'completed')
    ? 'completed'
    : 'cancelled';
}

export async function syncTicketStatus(
  tx: Prisma.TransactionClient,
  tripTicketId: string
): Promise<void> {
  const ticket = await tx.tripTicket.findUniqueOrThrow({
    where: { id: tripTicketId },
    select: { status: true, dates: { select: { status: true } } }
  });
  const next = deriveTicketStatus(ticket.status, ticket.dates);
  if (next !== ticket.status) {
    await tx.tripTicket.update({
      where: { id: tripTicketId },
      data: { status: next }
    });
  }
}

/**
 * Which outing is the guard releasing?
 *
 * The QR carries the TICKET id — drivers may be holding printed ones — so the
 * server picks the row: the earliest scheduled outing that has not already
 * finished and does not start after today. A trip next week is refused rather
 * than released early.
 *
 * Brief defect #3: "today" is bounded by `endOfDisplayDay`, in the fleet's
 * Asia/Manila display timezone (lib/timezone.ts) — never the host process's
 * local time. See that module's doc comment for why a host-local bound is a
 * real bug here (it refuses ordinary morning departures under a UTC process).
 */
export async function resolveOutingForCheckOut(
  tx: Prisma.TransactionClient,
  tripTicketId: string,
  now: Date = new Date()
) {
  const outing = await tx.tripDate.findFirst({
    where: {
      tripTicketId,
      status: 'scheduled',
      endTs: { gt: now },
      startTs: { lte: endOfDisplayDay(now) }
    },
    orderBy: { startTs: 'asc' }
  });
  if (!outing) {
    throw new AppError(
      409,
      'NO_OUTING_TODAY',
      'This trip ticket has no outing scheduled today'
    );
  }
  return outing;
}

/** Check-in closes whichever outing is currently out. Only one can be. */
export async function resolveOutingForCheckIn(
  tx: Prisma.TransactionClient,
  tripTicketId: string
) {
  const outing = await tx.tripDate.findFirst({
    where: { tripTicketId, status: 'in_progress' },
    orderBy: { startTs: 'asc' }
  });
  if (!outing) {
    throw new AppError(
      409,
      'NO_OUTING_IN_PROGRESS',
      'No outing on this trip ticket is currently out'
    );
  }
  return outing;
}
