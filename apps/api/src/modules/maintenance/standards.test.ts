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

describe('maintenance-standards module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates a standard with nested schedule items and reads it back', async () => {
    const header = await adminHeader();
    const created = await request(app)
      .post('/api/maintenance-standards')
      .set('Authorization', header)
      .send({
        name: 'Diesel 10k',
        description: 'Every 10,000 km',
        scheduleItems: [
          {
            taskName: 'Oil change',
            intervalType: 'mileage',
            intervalMileage: 10000
          },
          {
            taskName: 'Timing belt',
            intervalType: 'both',
            intervalMileage: 60000,
            intervalMonths: 48
          }
        ]
      });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Diesel 10k');
    expect(created.body.scheduleItems).toHaveLength(2);
    const id = created.body.id as string;

    const fetched = await request(app)
      .get(`/api/maintenance-standards/${id}`)
      .set('Authorization', header);
    expect(fetched.body.scheduleItems).toHaveLength(2);

    const list = await request(app)
      .get('/api/maintenance-standards')
      .set('Authorization', header);
    expect(list.body.count).toBe(1);
    expect(list.body.data[0].scheduleItems).toBeDefined();
  });

  it('adds and removes individual schedule items', async () => {
    const header = await adminHeader();
    const std = await prisma.maintenanceStandard.create({
      data: { name: 'Base' }
    });
    const added = await request(app)
      .post(`/api/maintenance-standards/${std.id}/schedule-items`)
      .set('Authorization', header)
      .send({
        taskName: 'Brake check',
        intervalType: 'time',
        intervalMonths: 6
      });
    expect(added.status).toBe(201);
    const itemId = added.body.id as string;

    const removed = await request(app)
      .delete(`/api/maintenance-standards/schedule-items/${itemId}`)
      .set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await prisma.maintenanceScheduleItem.count()).toBe(0);
  });

  it('updates name/description and deletes the standard (cascading its items)', async () => {
    const header = await adminHeader();
    const std = await prisma.maintenanceStandard.create({
      data: {
        name: 'Old',
        scheduleItems: {
          create: [
            { taskName: 'X', intervalType: 'mileage', intervalMileage: 5000 }
          ]
        }
      }
    });
    const patched = await request(app)
      .patch(`/api/maintenance-standards/${std.id}`)
      .set('Authorization', header)
      .send({ name: 'New' });
    expect(patched.body.name).toBe('New');

    const removed = await request(app)
      .delete(`/api/maintenance-standards/${std.id}`)
      .set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await prisma.maintenanceScheduleItem.count()).toBe(0); // cascade
  });

  it('403s writes for non-admins and 403s reads for security_guard', async () => {
    const { user: r } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });
    const forbidden = await request(app)
      .post('/api/maintenance-standards')
      .set('Authorization', authHeader(r.id, r.email, 'requester'))
      .send({ name: 'X' });
    expect(forbidden.status).toBe(403);

    const { user: g } = await createTestUser({
      email: 'g@test.local',
      role: 'security_guard'
    });
    const guardRead = await request(app)
      .get('/api/maintenance-standards')
      .set('Authorization', authHeader(g.id, g.email, 'security_guard'));
    expect(guardRead.status).toBe(403);
  });
});
