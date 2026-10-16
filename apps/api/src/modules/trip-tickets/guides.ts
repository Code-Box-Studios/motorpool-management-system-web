import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

/**
 * How many seats the PARTICIPANTS take.
 *
 * The names are the truth and the count is a claim about them, but either may
 * stand alone: a requester who types no names and says "4 of us" has told you
 * the headcount just as plainly as one who lists four. So the larger of the two
 * is the figure a van is sized against — never `participants.length` on its own,
 * which reads a nameless party of four as an empty one.
 *
 * PARTICIPANTS_MISMATCH (service.ts) is what stops the two DISAGREEING when both
 * are given; this function is only reached once they don't. It lives here next
 * to `assertSeatsFit` because both callers of that function need this exact
 * arithmetic, and the reassign path had its own hand-rolled copy — the guides
 * half of the sum was extracted and this half was not, which is the one
 * duplication a shared helper was supposed to remove.
 */
export function participantHeadcount(
  participants: readonly string[] | null | undefined,
  participantsCount: number | null | undefined
): number {
  return Math.max(participants?.length ?? 0, participantsCount ?? 0);
}

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

/** Active driver/requester accounts from every branch, with public fields only. */
export async function listGuideOptions() {
  const users = await prisma.user.findMany({
    where: {
      status: 'active',
      userRole: { role: { name: { in: ['driver', 'requester'] } } }
    },
    select: {
      id: true,
      fullName: true,
      userRole: { select: { role: { select: { name: true } } } }
    },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }]
  });
  return users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    role: user.userRole!.role.name
  }));
}

/** New assignments must refer to distinct, active driver/requester users. */
export async function assertGuideUsersActive(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return; // The caller supplies the route-specific empty-list error.
  const count = await prisma.user.count({
    where: {
      id: { in: userIds },
      status: 'active',
      userRole: { role: { name: { in: ['driver', 'requester'] } } }
    }
  });
  if (count !== userIds.length) {
    throw new AppError(
      400,
      'INVALID_GUIDES',
      'Select distinct active drivers or requesters as guides'
    );
  }
}

/** Replace guide assignments atomically; historical employee rows remain until explicitly replaced. */
export async function replaceTripTicketGuides(
  tx: Prisma.TransactionClient,
  tripTicketId: string,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) {
    throw new AppError(
      400,
      'NO_GUIDES',
      'A trip ticket must keep at least one guide'
    );
  }
  await tx.tripTicketEmployee.deleteMany({ where: { tripTicketId } });
  await tx.tripTicketEmployee.createMany({
    data: userIds.map((userId) => ({ tripTicketId, userId }))
  });
}
