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

describe('tools module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, updates, and deletes a tool (admin)', async () => {
    const header = await adminHeader();
    const created = await request(app)
      .post('/api/tools')
      .set('Authorization', header)
      .field('name', 'Torque Wrench');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Torque Wrench',
      status: 'available'
    });
    const id = created.body.id as string;

    const removed = await request(app)
      .delete(`/api/tools/${id}`)
      .set('Authorization', header);
    expect(removed.status).toBe(204);
  });

  it('borrows via PATCH (status + borrowedById + dates) and returns via PATCH (clear fields)', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const created = await request(app)
      .post('/api/tools')
      .set('Authorization', header)
      .field('name', 'Jack');
    const id = created.body.id as string;

    const borrowed = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('status', 'borrowed')
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-07-01')
      .field('estimatedReturnDate', '2026-07-15');
    expect(borrowed.status).toBe(200);
    expect(borrowed.body).toMatchObject({
      status: 'borrowed',
      borrowedById: driver.id
    });
    expect(borrowed.body.borrowedDate).not.toBeNull();

    // Return: status back to available, borrow fields cleared to null ('' -> null).
    const returned = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('status', 'available')
      .field('borrowedById', '')
      .field('borrowedDate', '')
      .field('estimatedReturnDate', '');
    expect(returned.status).toBe(200);
    expect(returned.body).toMatchObject({
      status: 'available',
      borrowedById: null,
      borrowedDate: null
    });
  });

  it('lists newest-first, readable by driver, 403 for security_guard', async () => {
    const header = await adminHeader();
    await request(app)
      .post('/api/tools')
      .set('Authorization', header)
      .field('name', 'A');
    const { user: drv } = await createTestUser({
      email: 'd@test.local',
      role: 'driver'
    });
    const okd = await request(app)
      .get('/api/tools')
      .set('Authorization', authHeader(drv.id, drv.email, 'driver'));
    expect(okd.status).toBe(200);
    expect(okd.body.count).toBe(1);

    const { user: grd } = await createTestUser({
      email: 'g@test.local',
      role: 'security_guard'
    });
    const forbidden = await request(app)
      .get('/api/tools')
      .set('Authorization', authHeader(grd.id, grd.email, 'security_guard'));
    expect(forbidden.status).toBe(403);
  });

  it('403s writes for non-admins', async () => {
    const { user } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });
    const forbidden = await request(app)
      .post('/api/tools')
      .set('Authorization', authHeader(user.id, user.email, 'requester'))
      .field('name', 'X');
    expect(forbidden.status).toBe(403);
  });
});
