import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

/**
 * Seats. A guide occupies one exactly as a participant does.
 *
 * The driver is deliberately not counted — the driver is not a passenger, and
 * that exclusion is not precedent for excluding anyone who rides. Nor do guides
 * ever reconcile against `participantsCount`: that count is a claim about the
 * participant NAMES, which is why PARTICIPANTS_MISMATCH (service.ts) is a
 * separate rule that runs before this one and is untouched by guides.
 *
 * The message names BOTH figures. "That vehicle seats 12; the trip is for 13"
 * is unactionable to a requester who can see only ten names typed in — the
 * three seats they cannot account for are the guides they just added.
 */
export function assertSeatsFit(
  capacity: number,
  participants: number,
  guides: number
): void {
  const headcount = participants + guides;
  if (headcount > capacity) {
    throw new AppError(
      409,
      'OVER_CAPACITY',
      `That vehicle seats ${capacity}; the trip is for ${participants} participant(s) and ${guides} guide(s)`
    );
  }
}

/**
 * Replace a ticket's guide rows wholesale.
 *
 * Delete-all-then-recreate, never a diff — the house pattern for child rows,
 * the same one `replaceTripDates` above and `job-orders/transitions.ts:95-105`
 * use. The composite primary key on (trip_ticket_id, employee_id) makes a
 * duplicate assignment unrepresentable, so a caller that names the same
 * employee twice fails loudly on the createMany rather than quietly seating
 * them twice.
 *
 * An EMPTY list is refused rather than obeyed, for the reason `replaceTripDates`
 * refuses one: obeying it would delete every guide and return 200, leaving a
 * ticket that violates the at-least-one-guide rule with no error anywhere.
 * `guideIds` is `.min(1)` on the create body and `.partial()` keeps that
 * refinement, so create and PATCH never reach this throw — zod answers them
 * first. POST /:id/guides does reach it: its body schema is deliberately not
 * `.min(1)`, so the empty case on that endpoint gets its own name instead of a
 * generic VALIDATION_ERROR.
 */
export async function replaceTripTicketGuides(
  tx: Prisma.TransactionClient,
  tripTicketId: string,
  employeeIds: string[]
): Promise<void> {
  if (employeeIds.length === 0) {
    throw new AppError(
      400,
      'NO_GUIDES',
      'A trip ticket must keep at least one guide'
    );
  }
  await tx.tripTicketEmployee.deleteMany({ where: { tripTicketId } });
  await tx.tripTicketEmployee.createMany({
    data: employeeIds.map((employeeId) => ({ tripTicketId, employeeId }))
  });
}
