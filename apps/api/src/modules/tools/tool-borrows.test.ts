import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import { stats } from './service.js';

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
    const renameRes = await rename;
    // round-3 review C2: status + a positive check that the rename itself
    // landed — without these, "the borrow row is unchanged" would stay
    // green even if this PATCH started 400ing and never reached the
    // date-derivation code this test exists to exercise.
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.name).toBe('Renamed Jack');

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
    const renamed = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('name', 'Jack v2');
    // round-3 review C2: without a status check and a positive assertion
    // that the request actually did something, this test would stay green
    // even if the PATCH started 400ing and exercised no production code —
    // "unchanged" alone cannot tell a no-op apart from a rejected request.
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Jack v2');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.borrowedAt.toISOString()).toBe(
      '2026-08-01T09:30:00.000Z'
    );
  });

  it('a fresh open discards leftover dates from an unrelated past loan (A3 corrected, round-3 A/C1)', async () => {
    // Round-2's version of this test (A3, B4) built exactly this state and
    // then asserted the LEFTOVER dueAt was inherited — encoding the round-2
    // A3 instruction, which round 3 identified as wrong: a fresh open
    // "can't be an echo" is false, since a tool can reach a fresh open
    // already carrying dead dates (from a past loan, or from being created
    // with dates and no driver at all — see the twin test below), and the
    // web form re-sends them regardless. The corrected rule is uniform:
    // a date identical to what the tool row already held is discarded as
    // an echo, whether this is a handoff or a fresh open. This test now
    // asserts BOTH halves — borrowedAt is NOT the leftover date, and dueAt
    // is null, not inherited — where round 2's version asserted neither
    // of those and only checked the (wrong) opposite of the second one.
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    // Leftover dates from a PREVIOUS, unrelated loan, with no current
    // borrower and no open borrow row.
    await prisma.tool.update({
      where: { id },
      data: {
        borrowedById: null,
        borrowedDate: new Date('2026-07-01'),
        estimatedReturnDate: new Date('2026-07-15')
      }
    });

    const before = new Date();
    // A fresh open: a new driver, echoing the leftover dates verbatim —
    // exactly what the web form does, since it prefills from the tool row
    // and only omits a field when it is null.
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-07-01')
      .field('estimatedReturnDate', '2026-07-15');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.borrowerId).toBe(driver.id);
    // The leftover dates belong to a loan this borrower was never part of.
    expect(borrows[0]!.borrowedAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(borrows[0]!.dueAt).toBeNull();
  });

  it('a tool created with dates but no borrower does not backdate its first real borrow (round-3 twin of A3 fix)', async () => {
    // The reproduction from the round-3 ruling, reachable with no unusual
    // input: POST /api/tools accepts borrowedDate/estimatedReturnDate
    // alongside an empty borrowedById (add-tools/action.ts sends exactly
    // this), so a tool can carry dead dates before it has EVER been
    // borrowed through the API — this is the most important new test this
    // round, since it is the shape that actually reaches production, not
    // just a hand-constructed edge case.
    const header = await adminHeader();
    const driver = await createDriver();

    const created = await request(app)
      .post('/api/tools')
      .set('Authorization', header)
      .field('name', 'Dated But Idle Drill')
      .field('borrowedById', '')
      .field('borrowedDate', '2026-07-01')
      .field('estimatedReturnDate', '2026-07-15');
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(await borrowsFor(id)).toHaveLength(0);

    const before = new Date();
    // Sign it out, touching only the driver select — the web form still
    // re-sends the tool's own (leftover) dates alongside it.
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-07-01')
      .field('estimatedReturnDate', '2026-07-15');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.borrowerId).toBe(driver.id);
    expect(borrows[0]!.borrowedAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(borrows[0]!.dueAt).toBeNull();
  });

  it('clears the tool rows date columns when a borrow closes, even if the PATCH never mentions them (round-3 B)', async () => {
    // Not explicitly required by the round-3 findings (Section B asks only
    // that this be flagged in the report as a deliberate, small behaviour
    // change), but worth pinning since nothing else in this file verifies
    // it directly: a return now clears tools.borrowed_date /
    // estimated_return_date at the source, so a shelved tool no longer
    // shows the last holder's dates and a later fresh open has no dead
    // state left to (correctly, now) discard. `borrowedById: ''` is the
    // only field sent — the OMITTED date fields prove the clearing is not
    // just this request's own body happening to blank them.
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');

    const returned = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', '');
    expect(returned.status).toBe(200);
    expect(returned.body.borrowedDate).toBeNull();
    expect(returned.body.estimatedReturnDate).toBeNull();
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
    const bOpened = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', b.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');
    // round-3 review C2: status + a positive check on each PATCH below —
    // "the closed row is unchanged" alone would stay green even if these
    // requests started 400ing and never reached the same-borrower sync
    // this test exists to exercise.
    expect(bOpened.status).toBe(200);

    const bEdited = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', b.id)
      .field('borrowedDate', '2026-08-12')
      .field('estimatedReturnDate', '2026-08-30');
    expect(bEdited.status).toBe(200);

    const finalBorrows = await borrowsFor(id);
    expect(finalBorrows).toHaveLength(2);
    const closedRow = finalBorrows.find((r) => r.borrowerId === a.id)!;
    expect(closedRow.borrowedAt.getTime()).toBe(closedBorrowedAt.getTime());
    expect(closedRow.dueAt?.getTime()).toBe(closedDueAt!.getTime());
    // Positive check: the OPEN row for B actually DID move to its new
    // dates — the guard only means something if the same-borrower sync is
    // confirmed to still do its job on the row it is supposed to touch.
    const openRow = finalBorrows.find((r) => r.borrowerId === b.id)!;
    expect(openRow.returnedAt).toBeNull();
    expect(openRow.borrowedAt.toISOString()).toBe('2026-08-12T00:00:00.000Z');
    expect(openRow.dueAt?.toISOString()).toBe('2026-08-30T00:00:00.000Z');
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

  // Fixed instant, matched to fixtures below via DAYS_AGO. The three window
  // tests call service.stats(NOW) DIRECTLY rather than through the route —
  // the route hands service.stats(new Date()), the real wall clock, so the
  // 90-day window it computes slides every day while these DAYS_AGO(...)
  // fixtures stay pinned to this literal, and the window eventually ages
  // them out from under the assertion (they did, on a 90-day clock, sail
  // right past this bug). Calling the service directly with this same NOW
  // removes the wall clock from the equation entirely, so this is stable
  // forever, not just today. Pinning TZ only makes a literal reproducible
  // across machines; it does nothing about a window that slides with real
  // time, which is what actually broke here.
  const NOW = new Date('2026-08-28T12:00:00.000Z');
  const DAYS_AGO = (n: number) =>
    new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

  // Tools have no unique constraint on `name`, so this is find-or-create rather
  // than an upsert — three borrows of "Popular" must land on ONE tool row or
  // the ranking test measures nothing.
  async function toolByName(name: string) {
    const existing = await prisma.tool.findFirst({ where: { name } });
    return existing ?? (await prisma.tool.create({ data: { name } }));
  }

  async function seedBorrow(opts: {
    toolName: string;
    borrowerId: string;
    borrowedAt: Date;
    returnedAt?: Date | null;
    dueAt?: Date | null;
  }) {
    const tool = await toolByName(opts.toolName);
    await prisma.toolBorrow.create({
      data: {
        toolId: tool.id,
        borrowerId: opts.borrowerId,
        borrowedAt: opts.borrowedAt,
        returnedAt: opts.returnedAt ?? null,
        dueAt: opts.dueAt ?? null
      }
    });
    return tool;
  }

  it('counts only OPEN borrows as tools out', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    await seedBorrow({
      toolName: 'Open Tool',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(2)
    });
    await seedBorrow({
      toolName: 'Returned Tool',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(10),
      returnedAt: DAYS_AGO(8)
    });

    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);

    expect(res.status).toBe(200);
    expect(res.body.toolsOut).toBe(1);
  });

  it('counts overdue only among OPEN borrows', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    await seedBorrow({
      toolName: 'Late And Still Out',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(10),
      dueAt: DAYS_AGO(3)
    });
    // Returned late. It is NOT overdue — it is back. Without this row the
    // assertion passes even if the query forgets `returnedAt IS NULL`.
    await seedBorrow({
      toolName: 'Late But Returned',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(20),
      dueAt: DAYS_AGO(15),
      returnedAt: DAYS_AGO(2)
    });

    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);

    expect(res.body.overdue).toBe(1);
  });

  it('does not count a tool due exactly today as overdue (day-boundary parity with the detail page)', async () => {
    // dueAt is `@db.Date`, always UTC midnight. The controller must truncate
    // `now` to the same UTC midnight before handing it to the service, or a
    // tool due today reads as overdue here from 00:00Z while the detail page
    // (comparing local calendar-day today) shows no badge until local
    // midnight — a real disagreement in Malta (UTC+2) for two hours a day.
    const header = await adminHeader();
    const driver = await createDriver();
    const now = new Date();
    const todayUtcMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    await seedBorrow({
      toolName: 'Due Today',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(5),
      dueAt: todayUtcMidnight
    });

    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);

    expect(res.body.overdue).toBe(0);
  });

  it('counts borrows inside the 90-day window and excludes older ones', async () => {
    const driver = await createDriver();
    await seedBorrow({
      toolName: 'Recent',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(80),
      returnedAt: DAYS_AGO(79)
    });
    await seedBorrow({
      toolName: 'Ancient',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(100),
      returnedAt: DAYS_AGO(99)
    });

    // Driven through service.stats(NOW) directly, not the route (which hands
    // the service the live wall clock) — see the NOW comment above.
    const result = await stats(NOW);

    expect(result.borrowsInWindow).toBe(1);
    expect(result.topBorrowed.map((t) => t.name)).toEqual(['Recent']);
  });

  it('ranks by borrow count and breaks ties by name', async () => {
    const driver = await createDriver();
    for (let i = 0; i < 3; i++) {
      await seedBorrow({
        toolName: 'Popular',
        borrowerId: driver.id,
        borrowedAt: DAYS_AGO(10 + i),
        returnedAt: DAYS_AGO(9 + i)
      });
    }
    await seedBorrow({
      toolName: 'Beta',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(5),
      returnedAt: DAYS_AGO(4)
    });
    await seedBorrow({
      toolName: 'Alpha',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(6),
      returnedAt: DAYS_AGO(5)
    });

    const result = await stats(NOW);

    expect(result.topBorrowed.map((t) => t.name)).toEqual([
      'Popular',
      'Alpha',
      'Beta'
    ]);
  });

  it('reports avgDaysOut as null with nothing returned, then ignores open borrows', async () => {
    const driver = await createDriver();
    await seedBorrow({
      toolName: 'Still Out',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(30)
    });

    const empty = await stats(NOW);
    expect(empty.avgDaysOut).toBeNull();

    await seedBorrow({
      toolName: 'Two Day Loan',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(10),
      returnedAt: DAYS_AGO(8)
    });

    const result = await stats(NOW);
    // The 30-day open borrow must not be averaged in.
    expect(result.avgDaysOut).toBeCloseTo(2, 1);
  });

  it('admits a driver and refuses a security guard', async () => {
    const { user: driverUser } = await createTestUser({
      email: 'du@test.local',
      role: 'driver'
    });
    const ok = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', authHeader(driverUser.id, driverUser.email, 'driver'));
    expect(ok.status).toBe(200);

    const { user: guard } = await createTestUser({
      email: 'gu@test.local',
      role: 'security_guard'
    });
    const refused = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', authHeader(guard.id, guard.email, 'security_guard'));
    expect(refused.status).toBe(403);
  });

  it('resolves /stats as its own route, not as a tool id', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);
    // A /stats declared AFTER /:id is swallowed by it and handed to Prisma as a
    // uuid, which throws P2023 and surfaces as a 500 that looks like a DB fault.
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
  });
});
