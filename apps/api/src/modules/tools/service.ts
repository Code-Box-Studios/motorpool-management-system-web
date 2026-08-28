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
    // the same treatment as update.
    await syncBorrow(tx, tool.id, null, tool.borrowedById, {
      borrowedAt: tool.borrowedDate,
      dueAt: tool.estimatedReturnDate
    });
    return tool;
  });
}

// A locked read of just the borrow-relevant columns, taken INSIDE the update
// transaction (round-1 review F4 — see below).
type LockedTool = {
  borrowed_by: string | null;
  borrowed_date: Date | null;
  estimated_return_date: Date | null;
};

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
    // stale borrower and both act on it — one loses a close (a tool shows a
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

    const tool = await tx.tool.update({
      where: { id },
      data: { ...rest, ...(image !== undefined ? { image } : {}) }
    });

    // F1: on a handoff, a supplied date belongs to the INCOMING borrow only
    // if it actually differs from what the tool row held BEFORE this update.
    // The web form always re-sends borrowedDate/estimatedReturnDate prefilled
    // from the tool, so `body.borrowedDate === undefined` never fires on a
    // real handoff — an unconditional pass-through of `tool.borrowedDate`
    // would stamp the incoming borrower with the outgoing borrower's own
    // start/due dates. Compare by time value; both sides may be null.
    let borrowedAt: Date | null;
    let dueAt: Date | null;
    if (prev !== next && next !== null) {
      const borrowedDateChanged =
        (tool.borrowedDate?.getTime() ?? null) !==
        (lockedTool.borrowed_date?.getTime() ?? null);
      const dueDateChanged =
        (tool.estimatedReturnDate?.getTime() ?? null) !==
        (lockedTool.estimated_return_date?.getTime() ?? null);
      borrowedAt = borrowedDateChanged ? tool.borrowedDate : null;
      dueAt = dueDateChanged ? tool.estimatedReturnDate : null;
    } else {
      // A fresh open (prev === null) or a same-borrower dates-only edit
      // (F2, handled in syncBorrow): the post-update row's dates ARE this
      // borrow's dates, so pass them straight through.
      borrowedAt = tool.borrowedDate;
      dueAt = tool.estimatedReturnDate;
    }

    await syncBorrow(tx, id, prev, next, { borrowedAt, dueAt });
    return tool;
  });
}

export async function remove(id: string): Promise<void> {
  const existing = await findToolById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  await prisma.tool.delete({ where: { id } });
}
