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
    const header = await adminHeader();
    const id = await createTool(header);

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
});
