import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
const app = createApp();
beforeEach(truncateAll);
afterAll(() => prisma.$disconnect());
async function setup() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(branch.id);
  const { user } = await createTestUser({ role: 'admin' });
  return {
    branch,
    vehicle,
    driver,
    header: authHeader(user.id, user.email, 'admin')
  };
}
async function outing(
  t: Awaited<ReturnType<typeof setup>>,
  start: string,
  end: string,
  status: 'completed' | 'scheduled' = 'completed'
) {
  const ticket = await createTestTicket({
    branchId: t.branch.id,
    vehicleId: t.vehicle.id,
    driverId: t.driver.id,
    status: status === 'completed' ? 'completed' : 'approved'
  });
  const date = await prisma.tripDate.create({
    data: {
      tripTicketId: ticket.id,
      startTs: new Date(start),
      endTs: new Date(end),
      status,
      preTripCheckedAt: status === 'completed' ? new Date(start) : null,
      postTripCheckedAt: status === 'completed' ? new Date(end) : null
    }
  });
  return { ticket, date };
}
describe('administrator reports', () => {
  it('requires login and administrator role', async () => {
    expect((await request(app).get('/api/reports?type=trips')).status).toBe(
      401
    );
    const { user } = await createTestUser({ role: 'requester' });
    expect(
      (
        await request(app)
          .get('/api/reports?type=trips')
          .set('Authorization', authHeader(user.id, user.email, 'requester'))
      ).status
    ).toBe(403);
  });
  it('reports each outing with Manila date bounds and nullable odometers', async () => {
    const t = await setup();
    const { ticket } = await outing(
      t,
      '2026-10-24T16:00:00Z',
      '2026-10-24T17:00:00Z'
    );
    await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        startTs: new Date('2026-10-25T02:00:00Z'),
        endTs: new Date('2026-10-25T03:00:00Z'),
        status: 'completed',
        preTripCheckedAt: new Date('2026-10-25T02:00:00Z'),
        postTripCheckedAt: new Date('2026-10-25T03:00:00Z'),
        startMileage: 1100,
        endMileage: 1140
      }
    });
    await outing(t, '2026-10-25T16:00:00Z', '2026-10-25T17:00:00Z');
    const trips = await request(app)
      .get('/api/reports?type=trips&from=2026-10-25&to=2026-10-25')
      .set('Authorization', t.header);
    expect(trips.status).toBe(200);
    expect(trips.body.rows).toHaveLength(2);
    const readings = await request(app)
      .get('/api/reports?type=odometer&from=2026-10-25&to=2026-10-25')
      .set('Authorization', t.header);
    expect(readings.body.rows).toHaveLength(2);
    expect(readings.body.rows[0].startOdometer).toBeNull();
    expect(readings.body.rows[0].distance).toBeNull();
    expect(readings.body.rows[1].distance).toBe(40);
  });
  it('does not cap full reports at a list page', async () => {
    const t = await setup();
    await prisma.maintenance.createMany({
      data: Array.from({ length: 31 }, () => ({
        vehicleId: t.vehicle.id,
        type: 'preventive' as const,
        date: new Date('2026-10-25'),
        mileage: 1000
      }))
    });
    const r = await request(app)
      .get('/api/reports?type=maintenance')
      .set('Authorization', t.header);
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(31);
  });
  it('preserves unknown job metadata rather than inferring service location', async () => {
    const t = await setup();
    await prisma.jobOrder.create({
      data: {
        vehicleId: t.vehicle.id,
        branchId: t.branch.id,
        incidentDetails: 'Repair',
        dateOfRequest: new Date('2026-10-25')
      }
    });
    const r = await request(app)
      .get('/api/reports?type=job_orders')
      .set('Authorization', t.header);
    expect(r.status).toBe(200);
    expect(r.body.rows[0].serviceLocation).toBeNull();
    expect(r.body.rows[0].maintenanceType).toBeNull();
  });
  it('includes configured mileage-only preventive tasks when date filters are selected', async () => {
    const t = await setup();
    const standard = await prisma.maintenanceStandard.create({
      data: {
        name: 'Fleet standard',
        scheduleItems: {
          create: {
            taskName: 'Change oil',
            intervalType: 'mileage',
            intervalMileage: 5000
          }
        }
      },
      include: { scheduleItems: true }
    });
    await prisma.vehicle.update({
      where: { id: t.vehicle.id },
      data: { maintenanceStandardId: standard.id }
    });
    await prisma.vehicleMaintenanceTracking.create({
      data: {
        vehicleId: t.vehicle.id,
        maintenanceScheduleItemId: standard.scheduleItems[0]!.id,
        nextDueMileage: 5000
      }
    });
    const r = await request(app)
      .get('/api/reports?type=preventive&from=2026-10-25&to=2026-10-25')
      .set('Authorization', t.header);
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(1);
    expect(r.body.rows[0].interval).toContain('5,000');
  });
  it('counts multi-outing fuel allocations once and exposes missing GPS exclusions', async () => {
    const t = await setup();
    const { ticket } = await outing(
      t,
      '2026-10-25T00:00:00Z',
      '2026-10-25T00:10:00Z'
    );
    await prisma.fuelAllocation.create({
      data: {
        tripTicketId: ticket.id,
        vehicleId: t.vehicle.id,
        branchId: t.branch.id,
        requestedById: (await prisma.user.findFirstOrThrow()).id,
        liters: 15,
        fuelType: 'diesel',
        date: new Date('2026-10-25'),
        purpose: 'test',
        tripTo: 'city',
        status: 'approved'
      }
    });
    await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        status: 'completed',
        startTs: new Date('2026-10-25T01:00:00Z'),
        endTs: new Date('2026-10-25T01:10:00Z'),
        preTripCheckedAt: new Date('2026-10-25T01:00:00Z'),
        postTripCheckedAt: new Date('2026-10-25T01:10:00Z')
      }
    });
    await prisma.gpsData.createMany({
      data: [
        ['2026-10-25T00:00:00Z', 125],
        ['2026-10-25T00:10:00Z', 125.01],
        ['2026-10-25T01:00:00Z', 125],
        ['2026-10-25T01:10:00Z', 125.01]
      ].map(([at, longitude]) => ({
        vehicleId: t.vehicle.id,
        tripId: ticket.id,
        createdAt: new Date(at as string),
        latitude: 7,
        longitude: longitude as number
      }))
    });
    await outing(t, '2026-10-25T03:00:00Z', '2026-10-25T03:10:00Z');
    const r = await request(app)
      .get(
        `/api/reports?type=fuel&vehicleId=${t.vehicle.id}&from=2026-10-25&to=2026-10-25&plannedDistanceKm=40&proposedLiters=10`
      )
      .set('Authorization', t.header);
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(1);
    expect(r.body.fuel.totalLiters).toBe(15);
    expect(r.body.fuel.totalDistanceKm).toBeGreaterThan(2);
    expect(r.body.fuel.excluded).toHaveLength(1);
    expect(r.body.fuel.estimate.rate).toBeCloseTo(
      15 / r.body.fuel.totalDistanceKm,
      10
    );
  });
  it('stores explicit job-order classification and location through API create, edit and repair completion', async () => {
    const t = await setup();
    const created = await request(app)
      .post('/api/job-orders')
      .set('Authorization', t.header)
      .send({
        vehicleId: t.vehicle.id,
        branchId: t.branch.id,
        incidentDate: '2026-10-25',
        incidentDetails: 'Oil service',
        maintenanceType: 'preventive',
        serviceLocation: 'outside'
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      maintenanceType: 'preventive',
      serviceLocation: 'outside'
    });
    const edited = await request(app)
      .patch(`/api/job-orders/${created.body.id}`)
      .set('Authorization', t.header)
      .send({ serviceLocation: 'motorpool' });
    expect(edited.status).toBe(200);
    expect(edited.body.serviceLocation).toBe('motorpool');
    await prisma.jobOrder.update({
      where: { id: created.body.id },
      data: { status: 'ongoing_repair' }
    });
    const done = await request(app)
      .post(`/api/job-orders/${created.body.id}/complete-repair`)
      .set('Authorization', t.header)
      .send({
        repairDone: 'simple',
        completedMileage: 1000,
        maintenanceType: 'corrective',
        serviceLocation: 'outside'
      });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      maintenanceType: 'corrective',
      serviceLocation: 'outside'
    });
    expect((await prisma.maintenance.findFirstOrThrow()).type).toBe(
      'corrective'
    );
  });
  it('validates dates, fuel vehicle requirement, and planned distance', async () => {
    const t = await setup();
    for (const query of [
      'type=trips&from=2026-02-30',
      'type=trips&from=2026-10-25&to=2026-10-01',
      'type=fuel',
      'type=fuel&vehicleId=' + t.vehicle.id + '&plannedDistanceKm=-1'
    ]) {
      expect(
        (
          await request(app)
            .get('/api/reports?' + query)
            .set('Authorization', t.header)
        ).status
      ).toBe(400);
    }
  });
});

it('clearing repair metadata does not copy its old classification into maintenance', async () => {
  const t = await setup();
  const order = await prisma.jobOrder.create({
    data: {
      vehicleId: t.vehicle.id,
      branchId: t.branch.id,
      status: 'ongoing_repair',
      maintenanceType: 'preventive',
      serviceLocation: 'outside'
    }
  });
  const r = await request(app)
    .post(`/api/job-orders/${order.id}/complete-repair`)
    .set('Authorization', t.header)
    .send({
      repairDone: 'simple',
      completedMileage: 1000,
      maintenanceType: null,
      serviceLocation: null
    });
  expect(r.status).toBe(200);
  expect(r.body.maintenanceType).toBeNull();
  expect(r.body.serviceLocation).toBeNull();
  expect((await prisma.maintenance.findFirstOrThrow()).type).toBe('repair');
});
it('explains missing gate stamps and partially completed historical fuel tickets', async () => {
  const t = await setup();
  const missing = await outing(
    t,
    '2026-10-25T00:00:00Z',
    '2026-10-25T00:10:00Z'
  );
  await prisma.tripDate.update({
    where: { id: missing.date.id },
    data: { preTripCheckedAt: null }
  });
  const partial = await outing(
    t,
    '2026-10-25T01:00:00Z',
    '2026-10-25T01:10:00Z'
  );
  await prisma.tripTicket.update({
    where: { id: partial.ticket.id },
    data: { status: 'approved' }
  });
  await prisma.tripDate.create({
    data: {
      tripTicketId: partial.ticket.id,
      status: 'scheduled',
      startTs: new Date('2026-10-26T01:00:00Z'),
      endTs: new Date('2026-10-26T02:00:00Z')
    }
  });
  const r = await request(app)
    .get(
      `/api/reports?type=fuel&vehicleId=${t.vehicle.id}&from=2026-10-25&to=2026-10-25`
    )
    .set('Authorization', t.header);
  expect(r.status).toBe(200);
  expect(r.body.fuel.excluded).toHaveLength(2);
  expect(
    r.body.fuel.excluded.every((item: { reason: string }) =>
      /incomplete|missing gate/i.test(item.reason)
    )
  ).toBe(true);
  expect(r.body.fuel.estimate).toBeNull();
});
it('fuel branch filters use the requesting branch when a vehicle is borrowed', async () => {
  const t = await setup();
  const branch = await createTestBranch('Borrowing branch');
  const { ticket } = await outing(
    t,
    '2026-10-25T00:00:00Z',
    '2026-10-25T00:10:00Z'
  );
  await prisma.tripTicket.update({
    where: { id: ticket.id },
    data: { branchId: branch.id }
  });
  const r = await request(app)
    .get(
      `/api/reports?type=fuel&vehicleId=${t.vehicle.id}&branchId=${branch.id}`
    )
    .set('Authorization', t.header);
  expect(r.status).toBe(200);
  expect(r.body.filters.branch).toBe('Borrowing branch');
  expect(r.body.fuel.excluded).toHaveLength(1);
});
