import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Reconcile borrow history with a change of borrower.
 *
 * Borrowing in this app is an admin editing fields on the tool — there is no
 * borrow/return action to hook (spec §4.3). So the transition is DETECTED by
 * comparing the borrower before and after the save.
 *
 * Known cost of detecting rather than declaring: an admin who picks the wrong
 * driver and corrects it produces a close plus a fresh open — one phantom
 * borrow on the count. That is noise on a leaderboard, not a broken number.
 * Note a zero-day borrow is NOT evidence of it: a tool taken and returned the
 * same day is ordinary, and discarding those would drop real data.
 *
 * Always call inside the same transaction as the tool write, or a tool can show
 * a borrower with no matching open row — the one inconsistency the partial
 * unique index cannot catch.
 */
export async function syncBorrow(
  tx: Tx,
  toolId: string,
  prev: string | null,
  next: string | null,
  opts: { borrowedAt?: Date | null; dueAt?: Date | null } = {}
): Promise<void> {
  if (prev === next) {
    if (next === null) return; // nothing to do — no borrower before or after

    // Same borrower, only the dates moved (extending a loan, correcting a
    // mistyped date). Nothing else in the API ever updates an existing borrow
    // row's dates, so without this the open row goes permanently stale
    // against the tool row it is supposed to track (round-1 review F2).
    await tx.toolBorrow.updateMany({
      where: { toolId, returnedAt: null },
      data: {
        // Only when a real start date exists (round-2 review A2). `?? new
        // Date()` here pushed the start forward on every ordinary save for a
        // tool borrowed without a date -- a 19-day loan would report ~0 days
        // out. `returnedAt: null` above is also load-bearing: without it,
        // every CLOSED row for this tool gets re-dated too.
        ...(opts.borrowedAt ? { borrowedAt: opts.borrowedAt } : {}),
        dueAt: opts.dueAt ?? null
      }
    });
    return;
  }

  if (prev !== null) {
    // updateMany, not update: closing when nothing is open is a no-op, not an
    // error. Tools borrowed before this shipped have no row to close.
    await tx.toolBorrow.updateMany({
      where: { toolId, returnedAt: null },
      data: { returnedAt: new Date() }
    });
  }

  if (next !== null) {
    await tx.toolBorrow.create({
      data: {
        toolId,
        borrowerId: next,
        borrowedAt: opts.borrowedAt ?? new Date(),
        dueAt: opts.dueAt ?? null
      }
    });
  }
}
