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

async function fixture(phase: 'before' | 'after') {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const admin = await createTestUser({ role: 'admin', branchId: branch.id });
  const assigned = await createTestUser({
    role: 'driver',
    email: 'assigned-roster@test.local',
    branchId: branch.id
  });
  const driver = await createTestDriver(branch.id);
  await prisma.driver.update({
    where: { id: driver.id },
    data: { userId: assigned.user.id }
  });
  const ticket = await createTestTicket({
    branchId: branch.id,
    driverId: driver.id,
    vehicleId: vehicle.id
  });
  const date = await prisma.tripDate.create({
    data: {
      tripTicketId: ticket.id,
      startTs: new Date(Date.now() - 3600000),
      endTs: new Date(Date.now() + 3600000)
    }
  });
  const adminAuth = authHeader(admin.user.id, admin.user.email, 'admin');
  const assignedAuth = authHeader(
    assigned.user.id,
    assigned.user.email,
    'driver'
  );
  const gate = (direction: 'out' | 'in') =>
    request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-${direction}`)
      .set('Authorization', adminAuth)
      .send({ dateId: date.id });
  if (phase === 'after') expect((await gate('out')).status).toBe(200);
  const roster = async (status: 'active' | 'on_trip' | 'inactive') => {
    const response = await request(app)
      .patch(`/api/drivers/${driver.id}`)
      .set('Authorization', adminAuth)
      .send({ status });
    expect(response.status).toBe(200);
  };
  const read = (authorization = assignedAuth) =>
    request(app)
      .post(`/api/trip-tickets/${ticket.id}/dates/${date.id}/odometer`)
      .set('Authorization', authorization)
      .send({ phase, mileage: phase === 'before' ? 1000 : 1020 });
  return { date, vehicle, assigned, roster, read, gate };
}

describe('supported driver roster states and odometer eligibility', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  for (const phase of ['before', 'after'] as const) {
    for (const status of ['active', 'on_trip'] as const) {
      it(`persists the assigned ${status} driver's ${phase} reading`, async () => {
        const s = await fixture(phase);
        await s.roster(status);
        const response = await s.read();
        expect(response.status).toBe(200);
        const stored = await prisma.tripDate.findUniqueOrThrow({
          where: { id: s.date.id }
        });
        expect(stored).toMatchObject(
          phase === 'before'
            ? {
                startMileage: 1000,
                startMileageRecordedById: s.assigned.user.id,
                startMileageRecordedAt: expect.any(Date)
              }
            : {
                endMileage: 1020,
                endMileageRecordedById: s.assigned.user.id,
                endMileageRecordedAt: expect.any(Date)
              }
        );
      });
    }

    it(`refuses an inactive assigned driver's ${phase} reading without storing it`, async () => {
      const s = await fixture(phase);
      await s.roster('inactive');
      const response = await s.read();
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_TRANSITION');
      expect(
        await prisma.tripDate.findUniqueOrThrow({ where: { id: s.date.id } })
      ).toMatchObject({ startMileage: null, endMileage: null });
    });

    it(`refuses an unrelated driver's ${phase} reading on an on_trip assignment`, async () => {
      const s = await fixture(phase);
      await s.roster('on_trip');
      const other = await createTestUser({
        role: 'driver',
        email: 'unrelated-roster@test.local'
      });
      const response = await s.read(
        authHeader(other.user.id, other.user.email, 'driver')
      );
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('NOT_ASSIGNED_DRIVER');
      expect(
        await prisma.tripDate.findUniqueOrThrow({ where: { id: s.date.id } })
      ).toMatchObject({ startMileage: null, endMileage: null });
    });
  }

  it('still lets an on_trip driver complete gate scans with missing readings', async () => {
    const s = await fixture('before');
    await s.roster('on_trip');
    expect((await s.gate('out')).status).toBe(200);
    expect((await s.gate('in')).status).toBe(200);
    expect(
      await prisma.tripDate.findUniqueOrThrow({ where: { id: s.date.id } })
    ).toMatchObject({
      status: 'completed',
      startMileage: null,
      endMileage: null,
      preTripCheckedAt: expect.any(Date),
      postTripCheckedAt: expect.any(Date)
    });
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1000);
  });
});
