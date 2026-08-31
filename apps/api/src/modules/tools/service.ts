import type {
  CreateToolBody,
  ToolsListQuery,
  UpdateToolBody
} from '@mms/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { toOrderBy } from '../../lib/sorting.js';
import { prisma } from '../../lib/prisma.js';
import { findToolById, listTools } from './repository.js';
import { syncBorrow } from './borrows.js';

export async function list(query: ToolsListQuery) {
  const orderBy = toOrderBy<Prisma.ToolOrderByWithRelationInput>(
    query.sortBy,
    query.sortOrder,
    {
      name: (order) => ({ name: order }),
      status: (order) => ({ status: order }),
      // "Signed out to" shows the borrowing driver's name, so sort through the
      // to-one relation rather than by the raw foreign key.
      borrowedBy: (order) => ({ borrowedBy: { fullName: order } }),
      estimatedReturnDate: (order) => ({ estimatedReturnDate: order }),
      description: (order) => ({ description: order })
    },
    { updatedAt: 'desc' }
  );
  return listTools(toSkipTake(query), orderBy);
}

export async function getById(id: string) {
  const tool = await findToolById(id);
  if (!tool) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  return tool;
}

export async function create(body: CreateToolBody, imagePath: string | null) {
  return prisma.$transaction(async (tx) => {
    const tool = await tx.tool.create({ data: { ...body, image: imagePath } });
    // The contract allows a tool to be born already borrowed, so create needs
    // the same treatment as update. `prev` is null here and the row was just
    // written from the body, so there is nothing stale to echo (round-2 A1's
    // problem cannot arise on create) -- left as-is per the round-2 finding.
    await syncBorrow(tx, tool.id, null, tool.borrowedById, {
      borrowedAt: tool.borrowedDate,
      dueAt: tool.estimatedReturnDate
    });
    return tool;
  });
}

// A locked read of just the borrow-relevant columns, taken INSIDE the update
// transaction (round-1 review F4 -- see below).
type LockedTool = {
  borrowed_by: string | null;
  borrowed_date: Date | null;
  estimated_return_date: Date | null;
};

// Compare by time value; either side may be null. Used to tell a genuinely
// changed date from the web form re-submitting the same one (round-2 A1/A3).
function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

// Permissive passthrough (spec §6): whatever borrow fields the caller sends are
// written verbatim. '' already became null in the contract, so a "return" that
// sends empty borrow fields clears them. No borrow/return invariants enforced.
export async function update(
  id: string,
  body: UpdateToolBody,
  newImagePath: string | null
) {
  const existing = await findToolById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  const { removeImage, ...rest } = body;
  const image = newImagePath ? newImagePath : removeImage ? null : undefined;

  return prisma.$transaction(async (tx) => {
    // F4: `prev` must come from a row LOCKED inside this transaction, not
    // from `existing` above (a snapshot read before the transaction opens).
    // Under READ COMMITTED, two concurrent PATCHes can both read the same
    // stale borrower and both act on it -- one loses a close (a tool shows a
    // borrower with zero open rows) or a create collides on the partial
    // unique index and surfaces as a generic 409, discarding that request's
    // other edits. Moving the read onto `tx` without FOR UPDATE does NOT
    // close this window; only the lock does.
    const locked = await tx.$queryRaw<LockedTool[]>`
      SELECT borrowed_by, borrowed_date, estimated_return_date
      FROM tools WHERE id = ${id}::uuid FOR UPDATE
    `;
    const lockedTool = locked[0];
    if (!lockedTool) throw new AppError(404, 'NOT_FOUND', 'Tool not found');

    // Three-valued multipart convention: absent = leave, null = clear, value =
    // set. Reading `undefined` as "clear" would close an open borrow every
    // time somebody renamed a tool.
    const prev = lockedTool.borrowed_by;
    const next = body.borrowedById === undefined ? prev : body.borrowedById;

    // ---- round-2 Section A: replace the date derivation entirely ----
    //
    // tools.borrowed_date / tools.estimated_return_date are NEVER cleared --
    // not on return, not on handoff -- and the web form re-appends them on
    // EVERY save whenever they are non-null. Round 1 fixed the opening
    // moment (F1) but left the tool row disagreeing with the borrow row;
    // round 1's own same-borrower sync (F2) then faithfully copied that
    // disagreement back onto the open row one request later. The durable
    // fix is to make the tool row and the borrow row tell the same story:
    // when a new borrow opens, RE-DATE THE TOOL ROW to match it, so a later
    // same-borrower sync copies identical values and is a no-op.

    // What this save asks the TOOL row to hold. `undefined` means "leave",
    // so fall back to what the locked (pre-update) row already held.
    const askedStart =
      body.borrowedDate === undefined
        ? lockedTool.borrowed_date
        : body.borrowedDate;
    const askedDue =
      body.estimatedReturnDate === undefined
        ? lockedTool.estimated_return_date
        : body.estimatedReturnDate;

    let opening: { borrowedAt: Date; dueAt: Date | null } | null = null;
    let toolDateOverride: {
      borrowedDate?: Date;
      estimatedReturnDate?: Date | null;
    } = {};

    if (prev !== next && next !== null) {
      if (prev === null) {
        // A3: a FRESH open. There is no outgoing borrow, so nothing can be
        // an echo -- whatever this save asks for IS the truth. Running this
        // through the handoff's echo filter below would treat leftover
        // dates from a PRIOR, unrelated holder as "unchanged" and silently
        // drop them (dueAt -> null) even though they are the only dates on
        // offer.
        opening = { borrowedAt: askedStart ?? new Date(), dueAt: askedDue ?? null };
      } else {
        // A HANDOFF. A date identical to the OUTGOING borrow's is the form
        // echoing the previous holder's dates, not an intent for the new one.
        opening = {
          borrowedAt: sameDate(askedStart, lockedTool.borrowed_date)
            ? new Date()
            : (askedStart ?? new Date()),
          dueAt: sameDate(askedDue, lockedTool.estimated_return_date)
            ? null
            : (askedDue ?? null)
        };
      }
      // A1 -- THE KEY LINE. Make the tool row agree with the borrow we are
      // opening. Without it the tool row keeps the OUTGOING holder's dates,
      // every later save re-submits them (the web form always does), and
      // the same-borrower sync in syncBorrow copies them straight onto this
      // borrow's row one request later.
      toolDateOverride = {
        borrowedDate: opening.borrowedAt,
        estimatedReturnDate: opening.dueAt
      };
    }

    const tool = await tx.tool.update({
      where: { id },
      data: {
        ...rest,
        ...(image !== undefined ? { image } : {}),
        ...toolDateOverride
      }
    });

    await syncBorrow(
      tx,
      id,
      prev,
      next,
      opening ?? { borrowedAt: tool.borrowedDate, dueAt: tool.estimatedReturnDate }
    );
    return tool;
  });
}

export async function remove(id: string): Promise<void> {
  const existing = await findToolById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  await prisma.tool.delete({ where: { id } });
}
