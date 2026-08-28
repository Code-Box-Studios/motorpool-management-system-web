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

  it('derives the borrower comparison from a FOR UPDATE read inside the transaction (F4 mechanism check)', () => {
    // A genuine concurrency test would be flaky by construction — real
    // interleaving isn't deterministically controllable in a Postgres
    // integration test, and this is exactly the kind of test the review
    // warned against writing. This instead pins the mechanism the fix
    // depends on: `update` must lock the row with `FOR UPDATE` INSIDE the
    // transaction rather than reading the borrower from a snapshot taken
    // before the transaction opens. If a future change silently drops the
    // lock, this fails even though no functional test under non-concurrent
    // load would ever notice.
    const src = readFileSync(
      fileURLToPath(new URL('./service.ts', import.meta.url)),
      'utf8'
    );
    expect(src).toContain('tx.$queryRaw');
    expect(src).toMatch(/FOR UPDATE/);
  });
});
