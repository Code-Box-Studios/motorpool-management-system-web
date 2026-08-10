import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function admin() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return { id: user.id, header: authHeader(user.id, user.email, 'admin') };
}

async function vehicleWithStandard(mileage = 40000) {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Hiace',
      year: 2021,
      vin: 'V1',
      licensePlate: 'P1',
      capacity: 12,
      fuelType: 'diesel',
      mileage,
      branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-03-01')
    }
  });
  const standard = await prisma.maintenanceStandard.create({
    data: {
      name: 'Std',
      scheduleItems: {
        create: [
          { taskName: 'Oil', intervalType: 'mileage', intervalMileage: 10000 },
          {
            taskName: 'Belt',
            intervalType: 'both',
            intervalMileage: 60000,
            intervalMonths: 48
          }
        ]
      }
    },
    include: { scheduleItems: true }
  });
  return { vehicle, standard };
}

describe('vehicle maintenance tracking', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('assigns a standard, seeds tracking rows, and lists them with derived status', async () => {
    const a = await admin();
    const { vehicle, standard } = await vehicleWithStandard(40000);

    const assigned = await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    expect(assigned.status).toBe(201);
    expect(assigned.body.count).toBe(2);
    // Vehicle now carries the standard.
    expect(
      (await prisma.vehicle.findUnique({ where: { id: vehicle.id } }))
        ?.maintenanceStandardId
    ).toBe(standard.id);
    // next_due_mileage = currentMileage + interval (40000 + 10000).
    const oil = await prisma.vehicleMaintenanceTracking.findFirst({
      where: { vehicleId: vehicle.id, scheduleItem: { taskName: 'Oil' } }
    });
    expect(oil?.nextDueMileage).toBe(50000);
    expect(oil?.status).toBe('pending');

    const listed = await request(app)
      .get(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header);
    expect(listed.status).toBe(200);
    expect(listed.body.count).toBe(2);
    expect(listed.body.data[0]).toHaveProperty('displayStatus');
    expect(listed.body.data[0]).toHaveProperty('scheduleItem');

    // Re-assigning does not duplicate existing tracking rows.
    const again = await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    expect(again.body.count).toBe(0); // nothing new created
    expect(
      await prisma.vehicleMaintenanceTracking.count({
        where: { vehicleId: vehicle.id }
      })
    ).toBe(2);
  });

  it('completes a task: writes a log, updates last-completed + next-due, sets status completed', async () => {
    const a = await admin();
    const { vehicle, standard } = await vehicleWithStandard(40000);
    await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    const oil = await prisma.vehicleMaintenanceTracking.findFirstOrThrow({
      where: { vehicleId: vehicle.id, scheduleItem: { taskName: 'Oil' } }
    });

    const res = await request(app)
      .post(`/api/maintenance-tracking/${oil.id}/complete`)
      .set('Authorization', a.header)
      .send({ completedMileage: 52000, notes: 'Done' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.lastCompletedMileage).toBe(52000);
    expect(res.body.nextDueMileage).toBe(62000); // 52000 + 10000

    expect(
      await prisma.maintenanceCompletionLog.count({
        where: { vehicleMaintenanceTrackingId: oil.id }
      })
    ).toBe(1);
    const log = await prisma.maintenanceCompletionLog.findFirstOrThrow({
      where: { vehicleMaintenanceTrackingId: oil.id }
    });
    expect(log.completedById).toBe(a.id);
    expect(log.completedMileage).toBe(52000);
  });

  it('403s tracking reads for security_guard and 403s writes for non-admins', async () => {
    const { vehicle, standard } = await vehicleWithStandard();
    const { user: g } = await createTestUser({
      email: 'g@test.local',
      role: 'security_guard'
    });
    const guardRead = await request(app)
      .get(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', authHeader(g.id, g.email, 'security_guard'));
    expect(guardRead.status).toBe(403);

    const { user: d } = await createTestUser({
      email: 'd@test.local',
      role: 'driver'
    });
    const driverAssign = await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', authHeader(d.id, d.email, 'driver'))
      .send({ maintenanceStandardId: standard.id });
    expect(driverAssign.status).toBe(403);
  });

  it('does not create a duplicate tracking row when the unique key already exists', async () => {
    const a = await admin();
    const { vehicle, standard } = await vehicleWithStandard();
    await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    const before = await prisma.vehicleMaintenanceTracking.count({
      where: { vehicleId: vehicle.id }
    });
    // Re-assign: no new rows, and no crash from the unique constraint.
    const again = await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    expect(again.status).toBe(201);
    expect(again.body.count).toBe(0);
    expect(
      await prisma.vehicleMaintenanceTracking.count({
        where: { vehicleId: vehicle.id }
      })
    ).toBe(before);
  });
});
