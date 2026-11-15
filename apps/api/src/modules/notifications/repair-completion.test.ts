import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

describe('repair completion notification history', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('records repair completion without claiming availability while another repair holds the vehicle', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const mechanic = await createTestDriver(branch.id);
    const { user: admin } = await createTestUser();
    const { user: requester } = await createTestUser({
      role: 'requester',
      email: 'repair-history@test.local'
    });
    const adminHeader = authHeader(admin.id, admin.email, 'admin');
    const requesterHeader = authHeader(
      requester.id,
      requester.email,
      'requester'
    );
    const part = await prisma.sparePart.create({
      data: { name: 'Brake pad', quantity: 3 }
    });
    const ids: string[] = [];
    for (const number of [1, 2]) {
      const created = await request(app)
        .post('/api/job-orders')
        .set('Authorization', adminHeader)
        .send({
          branchId: branch.id,
          vehicleId: vehicle.id,
          requestedById: requester.id,
          incidentDate: new Date(Date.now() - 60_000).toISOString(),
          incidentDetails: `Repair ${number}`
        });
      expect(created.status).toBe(201);
      ids.push(created.body.id);
      const noted = await request(app)
        .post(`/api/job-orders/${created.body.id}/note`)
        .set('Authorization', adminHeader)
        .send({
          assignedMechanicId: mechanic.id,
          spareParts: [{ sparePartId: part.id, quantity: 1 }]
        });
      expect(noted.status).toBe(200);
      const approved = await request(app)
        .post(`/api/job-orders/${created.body.id}/approve`)
        .set('Authorization', adminHeader)
        .send({});
      expect(approved.status).toBe(200);
    }

    for (const [index, id] of ids.entries()) {
      const completed = await request(app)
        .post(`/api/job-orders/${id}/complete-repair`)
        .set('Authorization', adminHeader)
        .send({ repairDone: 'simple', completedMileage: 1000 });
      expect(completed.status).toBe(200);
      expect(completed.body.status).toBe('repaired');
      const fleet = await prisma.vehicle.findUniqueOrThrow({
        where: { id: vehicle.id }
      });
      expect(fleet.status).toBe(
        index === 0 ? 'under_maintenance' : 'available'
      );
      expect(
        await prisma.jobOrder.count({
          where: {
            vehicleId: vehicle.id,
            status: { in: ['assigned_mechanic', 'ongoing_repair'] }
          }
        })
      ).toBe(index === 0 ? 1 : 0);
      const stored = await prisma.notification.findFirstOrThrow({
        where: {
          userId: requester.id,
          type: 'job_order_completed',
          linkTo: `/job-order/${id}`
        }
      });
      expect(stored.body).toMatch(/repair.*(closed|completed)/i);
      expect(stored.body).not.toMatch(
        /available|back on the road|ready to (drive|use)/i
      );
      const bell = await request(app)
        .get('/api/notifications')
        .set('Authorization', requesterHeader);
      expect(bell.status).toBe(200);
      expect(
        bell.body.data.find((row: { id: string }) => row.id === stored.id)
      ).toMatchObject({
        currentStatus: 'repaired',
        body: stored.body
      });
      expect(
        (await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } }))
          .quantity
      ).toBe(1);
      expect(
        await prisma.maintenance.count({ where: { vehicleId: vehicle.id } })
      ).toBe(index + 1);
    }
  });

  it('removes the stale availability claim from legacy completion notifications without rewriting stored history', async () => {
    const { user: requester } = await createTestUser({ role: 'requester' });
    const legacy = await prisma.notification.create({
      data: {
        userId: requester.id,
        type: 'job_order_completed',
        title: 'JO-17 is repaired',
        body: 'The repair is closed and the vehicle is available again.',
        readAt: new Date('2026-11-01T00:00:00Z')
      }
    });
    const listed = await request(app)
      .get('/api/notifications')
      .set(
        'Authorization',
        authHeader(requester.id, requester.email, 'requester')
      );
    expect(listed.status).toBe(200);
    expect(listed.body.unread).toBe(0);
    expect(listed.body.data[0]).toMatchObject({
      id: legacy.id,
      readAt: legacy.readAt!.toISOString()
    });
    expect(listed.body.data[0].body).toMatch(/repair.*(closed|completed)/i);
    expect(listed.body.data[0].body).not.toMatch(/available/i);
    expect(
      await prisma.notification.findUniqueOrThrow({ where: { id: legacy.id } })
    ).toEqual(legacy);
  });
});
