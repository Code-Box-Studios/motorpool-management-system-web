import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return authHeader(user.id, user.email, 'admin');
}

async function createDriver(email = 'wheel@test.local') {
  return prisma.driver.create({
    data: { email, fullName: 'Wheel Man', status: 'active' }
  });
}

async function createTool(header: string, name = 'Jack') {
  const res = await request(app)
    .post('/api/tools')
    .set('Authorization', header)
    .field('name', name);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const borrowsFor = (toolId: string) =>
  prisma.toolBorrow.findMany({
    where: { toolId },
    orderBy: { borrowedAt: 'asc' }
  });

describe('tool borrow history', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('opens a borrow when a borrower is set', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('status', 'borrowed')
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.borrowerId).toBe(driver.id);
    expect(borrows[0]!.returnedAt).toBeNull();
    // The admin's entered date is the truth about when the tool left the shelf.
    expect(borrows[0]!.borrowedAt.toISOString()).toBe(
      '2026-08-10T00:00:00.000Z'
    );
    // dueAt is the exact column Task 6's Overdue metric is computed from
    // (round-1 review F6) — assert the round-trip, not just borrowedAt.
    expect(borrows[0]!.dueAt?.toISOString()).toBe(
      '2026-08-20T00:00:00.000Z'
    );
  });

  it('closes the borrow when the borrower is cleared', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-10');

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('status', 'available')
      .field('borrowedById', '')
      .field('borrowedDate', '')
      .field('estimatedReturnDate', '');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.returnedAt).not.toBeNull();
  });

  it('closes one and opens another on a handoff, keeping the first borrowedAt', async () => {
    const header = await adminHeader();
    const a = await createDriver('a@test.local');
    const b = await createDriver('b@test.local');
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', a.id)
      .field('borrowedDate', '2026-08-10');

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', b.id)
      .field('borrowedDate', '2026-08-14');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(2);
    expect(borrows[0]!.borrowerId).toBe(a.id);
    expect(borrows[0]!.returnedAt).not.toBeNull();
    // The first borrow keeps its ORIGINAL start — a handoff must not rewrite
    // when the tool actually left.
    expect(borrows[0]!.borrowedAt.toISOString()).toBe(
      '2026-08-10T00:00:00.000Z'
    );
    expect(borrows[1]!.borrowerId).toBe(b.id);
    expect(borrows[1]!.returnedAt).toBeNull();
  });

  it('a handoff that re-sends the outgoing borrower dates does not inherit them (F1)', async () => {
    // The web form always re-sends borrowedDate/estimatedReturnDate,
    // prefilled from the tool row (tools-inner/index.tsx + lib/api/tools.ts)
    // — so a real handoff PATCH resends the OUTGOING borrower's own dates
    // verbatim. `body.borrowedDate === undefined` never fires here; the fix
    // must compare against what the tool row held before the update.
    const header = await adminHeader();
    const a = await createDriver('a@test.local');
    const b = await createDriver('b@test.local');
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', a.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', b.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(2);
    expect(borrows[1]!.borrowerId).toBe(b.id);
    // B's borrow must NOT start on A's start date — that would mean B
    // inherited the outgoing borrower's dates.
    expect(borrows[1]!.borrowedAt.getTime()).not.toBe(
      borrows[0]!.borrowedAt.getTime()
    );
    expect(borrows[1]!.dueAt).toBeNull();
  });

  it('editing only the dates of an open borrow updates that row instead of leaving it stale (F2)', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');

    // Same borrower, dates only — extending or correcting a loan. Nothing
    // else in the API ever updates an existing borrow row's dates, so
    // without the fix this leaves the open row permanently stale.
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-12')
      .field('estimatedReturnDate', '2026-08-30');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.returnedAt).toBeNull();
    expect(borrows[0]!.borrowedAt.toISOString()).toBe(
      '2026-08-12T00:00:00.000Z'
    );
    expect(borrows[0]!.dueAt?.toISOString()).toBe(
      '2026-08-30T00:00:00.000Z'
    );
  });

  it('leaves the open borrow alone when the PATCH omits borrowedById', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-10');

    // Renaming the tool must not read as a return. `undefined` means "leave",
    // '' means "clear" — this is the assertion that fails if they are conflated.
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('name', 'Renamed Jack');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.returnedAt).toBeNull();
  });

  it('opens a borrow when a tool is CREATED already borrowed', async () => {
    const header = await adminHeader();
    const driver = await createDriver();

    const res = await request(app)
      .post('/api/tools')
      .set('Authorization', header)
      .field('name', 'Pre-lent Drill')
      .field('status', 'borrowed')
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-11');
    expect(res.status).toBe(201);

    const borrows = await borrowsFor(res.body.id as string);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.returnedAt).toBeNull();
  });

  it('clearing a borrower with no open row succeeds and creates nothing', async () => {
    // Round-1 review F3: the original version of this test posted a tool with
    // no borrower at all (prev = null) and cleared borrowedById (next =
    // null), so prev === next and syncBorrow returned before its body ever
    // ran — vacuous under any change to that body. The legacy state this
    // test claims to cover — a borrower ON THE TOOL ROW with NO open
    // tool_borrows row — is constructed here directly, bypassing the
    // service, so prev = driver.id and the PATCH genuinely exercises the
    // "close, but nothing is open" no-op path.
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await prisma.tool.update({
      where: { id },
      data: { borrowedById: driver.id }
    });

    // Tools edited before this shipped have no open row. Refusing their return
    // would break a working screen over a record that was never taken.
    const res = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', '');
    expect(res.status).toBe(200);
    expect(await borrowsFor(id)).toHaveLength(0);
  });

  it('refuses a second open borrow for one tool', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id);

    await expect(
      prisma.toolBorrow.create({
        data: { toolId: id, borrowerId: driver.id, borrowedAt: new Date() }
      })
    ).rejects.toThrow();
  });

  it('deletes borrows with the tool rather than refusing the delete', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id);

    const removed = await request(app)
      .delete(`/api/tools/${id}`)
      .set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await borrowsFor(id)).toHaveLength(0);
  });

  it('names the reason a driver with returned borrow history cannot be deleted (F5)', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', '');

    // The tool is fully returned — the driver holds nothing — yet the
    // CLOSED tool_borrows row still RESTRICTs driver deletion (deliberately;
    // borrow history must not silently vanish). An assertion on status alone
    // would pass against today's generic 409 CONFLICT; the message must name
    // borrow history as the reason.
    const res = await request(app)
      .delete(`/api/drivers/${driver.id}`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/borrow history/i);
  });

  it('a second unrelated save after a handoff does not re-corrupt the new open row (A1 regression, round-2 B1)', async () => {
    // This is the bug round 2 exists for. The handoff PATCH must ECHO A's
    // own dates verbatim -- exactly what the web form actually sends, since
    // the date inputs stay prefilled from the tool row it read before the
    // driver was changed (a request that supplies genuinely NEW dates
    // already writes them via `rest` regardless of this fix, so it would
    // not exercise the bug at all). Round 1's F1 fix correctly gives B a
    // fresh borrowedAt on the handoff itself, but only because the tool row
    // still holds A's dates at that instant. The very next save re-reads
    // and re-submits whatever the tool row NOW shows -- if that save does
    // not ALSO keep the tool row in sync with the open borrow, an ordinary
    // follow-up save (a rename, here) stamps A's stale dates right back
    // onto B's row.
    //
    // borrowedAt is compared by CALENDAR DAY, not exact instant: B's row
    // gets its `new Date()` fallback at full timestamp precision, while the
    // tool row's copy round-trips through a `@db.Date` column and loses
    // its time-of-day on every read -- a resync onto the SAME day is
    // correct, expected behaviour, not evidence of drift. dueAt has no such
    // ambiguity (it is either null or an exact date), so it is compared
    // exactly.
    const header = await adminHeader();
    const a = await createDriver('a@test.local');
    const b = await createDriver('b@test.local');
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', a.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');

    // Handoff to B, ECHOING A's own dates verbatim.
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', b.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');

    const afterHandoff = await borrowsFor(id);
    expect(afterHandoff).toHaveLength(2);
    const bDay = afterHandoff[1]!.borrowedAt.toISOString().slice(0, 10);
    // Sanity check that the echo was actually detected: B did not inherit
    // A's calendar day.
    expect(bDay).not.toBe('2026-08-10');
    expect(afterHandoff[1]!.dueAt).toBeNull();

    // What the tool row shows right now — read back through the real GET
    // endpoint, exactly as the web form would before its next save.
    const toolNow = await request(app)
      .get(`/api/tools/${id}`)
      .set('Authorization', header);

    // A second, UNRELATED save (a rename) that re-sends borrowedById=B and
    // whatever the tool row currently shows — exactly what
    // lib/api/tools.ts does, appending a date field only when it is
    // non-null.
    const rename = request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('name', 'Renamed Jack')
      .field('borrowedById', b.id);
    if (toolNow.body.borrowedDate !== null) {
      rename.field('borrowedDate', toolNow.body.borrowedDate as string);
    }
    if (toolNow.body.estimatedReturnDate !== null) {
      rename.field(
        'estimatedReturnDate',
        toolNow.body.estimatedReturnDate as string
      );
    }
    await rename;

    const afterRename = await borrowsFor(id);
    expect(afterRename).toHaveLength(2);
    expect(afterRename[1]!.borrowedAt.toISOString().slice(0, 10)).toBe(bDay);
    expect(afterRename[1]!.dueAt).toBeNull();
  });

  it('a handoff supplying a genuinely different date attributes it to the incoming borrower (F1 positive half, round-2 B2)', async () => {
    // Round 1's F1 test only pinned that an ECHOED date is rejected. Nothing
    // asserted that a genuinely changed date is actually attributed to the
    // incoming borrower — an unconditional borrowedAt=null/dueAt=null on
    // every handoff would have survived that test too.
    const header = await adminHeader();
    const a = await createDriver('a@test.local');
    const b = await createDriver('b@test.local');
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', a.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', b.id)
      .field('borrowedDate', '2026-08-15')
      .field('estimatedReturnDate', '2026-08-28');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(2);
    expect(borrows[1]!.borrowerId).toBe(b.id);
    expect(borrows[1]!.borrowedAt.toISOString()).toBe(
      '2026-08-15T00:00:00.000Z'
    );
    expect(borrows[1]!.dueAt?.toISOString()).toBe('2026-08-28T00:00:00.000Z');
  });

  it('a same-borrower save does not push the start date forward when the tool row has none (A2, round-2 B3)', async () => {
    // A1's re-dating means any open made THROUGH the API always stamps a
    // concrete borrowedDate onto the tool row, so the only way to reach A2's
    // actual guard condition (opts.borrowedAt null) is a borrow that never
    // went through that re-dating — exactly what a borrow opened under the
    // OLD (pre-round-2) code, or written directly, looks like. Constructed
    // here directly, bypassing the service, same as round-1's F3 fix did.
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await prisma.tool.update({
      where: { id },
      data: {
        borrowedById: driver.id,
        borrowedDate: null,
        estimatedReturnDate: null
      }
    });
    await prisma.toolBorrow.create({
      data: {
        toolId: id,
        borrowerId: driver.id,
        borrowedAt: new Date('2026-08-01T09:30:00.000Z')
      }
    });

    // Same borrower, no dates supplied — an ordinary rename.
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('name', 'Jack v2');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.borrowedAt.toISOString()).toBe(
      '2026-08-01T09:30:00.000Z'
    );
  });

  it('a fresh open keeps the tool rows existing due date when none is supplied (A3, round-2 B4)', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    // Leftover dates from a PREVIOUS holder, with no current borrower and no
    // open borrow row — exactly what a return leaves behind, since
    // borrowedDate/estimatedReturnDate are never cleared.
    await prisma.tool.update({
      where: { id },
      data: {
        borrowedById: null,
        borrowedDate: new Date('2026-07-01'),
        estimatedReturnDate: new Date('2026-07-15')
      }
    });

    // A fresh open: a new driver, no new dates supplied.
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id);

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.borrowerId).toBe(driver.id);
    // The leftover due date is the only date on offer — a fresh open has no
    // outgoing borrow to echo, so it must NOT be discarded as one.
    expect(borrows[0]!.dueAt?.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('a tool created already borrowed carries its due date onto the opening borrow row (F6 at create, round-2 B6)', async () => {
    const header = await adminHeader();
    const driver = await createDriver();

    const res = await request(app)
      .post('/api/tools')
      .set('Authorization', header)
      .field('name', 'Born Borrowed Drill')
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-11')
      .field('estimatedReturnDate', '2026-08-20');
    expect(res.status).toBe(201);

    const borrows = await borrowsFor(res.body.id as string);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.dueAt?.toISOString()).toBe('2026-08-20T00:00:00.000Z');
  });

  it('a same-borrower edit does not re-date an already-closed borrow row (closed-row guard, round-2 B7)', async () => {
    const header = await adminHeader();
    const a = await createDriver('a@test.local');
    const b = await createDriver('b@test.local');
    const id = await createTool(header);

    // A closed borrow for A...
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', a.id)
      .field('borrowedDate', '2026-08-01')
      .field('estimatedReturnDate', '2026-08-05');
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', '')
      .field('borrowedDate', '')
      .field('estimatedReturnDate', '');

    const afterReturn = await borrowsFor(id);
    expect(afterReturn).toHaveLength(1);
    const closedBorrowedAt = afterReturn[0]!.borrowedAt;
    const closedDueAt = afterReturn[0]!.dueAt;
    expect(afterReturn[0]!.returnedAt).not.toBeNull();

    // ...then B opens a SEPARATE borrow and edits its own dates (same
    // borrower, dates only) — the write this guard protects against would
    // re-date every row for this tool, closed or not.
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', b.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', b.id)
      .field('borrowedDate', '2026-08-12')
      .field('estimatedReturnDate', '2026-08-30');

    const finalBorrows = await borrowsFor(id);
    expect(finalBorrows).toHaveLength(2);
    const closedRow = finalBorrows.find((r) => r.borrowerId === a.id)!;
    expect(closedRow.borrowedAt.getTime()).toBe(closedBorrowedAt.getTime());
    expect(closedRow.dueAt?.getTime()).toBe(closedDueAt!.getTime());
  });

  it('derives the borrower comparison from a locked read inside the transaction, not a pre-transaction snapshot (F4 mechanism check, round-2 B5)', () => {
    // Round 1's version of this test asserted the file text matched
    // /FOR UPDATE/ — but service.ts carried that exact string in a COMMENT,
    // so deleting the real SQL clause, or reverting `prev` to
    // `existing.borrowedById` (the original F4 defect), both left it green.
    // That is the same vacuity class as round-1's own F3.
    //
    // A genuine concurrency test would still be flaky by construction — real
    // interleaving is not deterministically controllable in a Postgres
    // integration test — so this stays a source pin, but a pin that fails
    // for the right reason: comments are stripped first, `$queryRaw` and
    // `FOR UPDATE` must appear WITHIN THE SAME statement (not merely both
    // present somewhere in the file), and the original defect's exact shape
    // must not reappear.
    const raw = readFileSync(
      fileURLToPath(new URL('./service.ts', import.meta.url)),
      'utf8'
    );
    const src = raw
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

    const queryRawStatement = src.match(/tx\.\$queryRaw[\s\S]*?;/);
    expect(queryRawStatement).not.toBeNull();
    expect(queryRawStatement![0]).toMatch(/FOR UPDATE/);

    expect(src).not.toMatch(/prev\s*=\s*existing\.borrowedById/);
  });
});
