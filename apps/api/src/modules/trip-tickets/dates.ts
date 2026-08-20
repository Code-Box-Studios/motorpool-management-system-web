import type { Prisma } from '@prisma/client';
import type { TripDateInput } from '@mms/shared';

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
 */
export async function replaceTripDates(
  tx: Prisma.TransactionClient,
  tripTicketId: string,
  dates: TripDateInput[]
): Promise<void> {
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
