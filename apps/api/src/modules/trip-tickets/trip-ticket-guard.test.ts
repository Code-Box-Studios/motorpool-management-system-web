import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function approvedTicket(vehicleStatus: 'available' | 'under_maintenance' = 'available') {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: vehicleStatus, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({ data: { email: 'd@test.local', fullName: 'D', status: 'active', branchId: branch.id } });
  const ticket = await prisma.tripTicket.create({
    data: { branchId: branch.id, driverId: driver.id, vehicleId: vehicle.id, destination: 'A', purpose: 'P', dateRequested: new Date('2026-07-10'), preparedBy: '', status: 'approved' }
  });
  return { vehicle, ticket };
}

describe('trip-ticket guard transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('check-out: approved → in_progress, records the guard, flips vehicle to on_trip', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { user: guard } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', authHeader(guard.id, guard.email, 'security_guard')).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.preTripGuardId).toBe(guard.id);
    expect(res.body.preTripCheckedById).toBe(guard.id);
    expect(res.body.preTripCheckedAt).not.toBeNull();
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('on_trip');
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: vehicle.id, newStatus: 'on_trip' } })).toBe(1);
  });

  it('check-out still succeeds but SKIPS the vehicle flip when the vehicle is not available', async () => {
    const { vehicle, ticket } = await approvedTicket('under_maintenance');
    const { user: guard } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', authHeader(guard.id, guard.email, 'security_guard')).send({});
    expect(res.status).toBe(200); // ticket transition succeeds
    expect(res.body.status).toBe('in_progress');
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('under_maintenance'); // unchanged
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: vehicle.id } })).toBe(0); // skip-and-log
  });

  it('check-in: in_progress → completed, records post-trip guard, flips vehicle to available', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { user: guard } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const header = authHeader(guard.id, guard.email, 'security_guard');
    await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', header).send({});
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-in`).set('Authorization', header).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.postTripGuardId).toBe(guard.id);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('available');
  });

  it('403 for non-guard, 409 for the wrong from-state', async () => {
    const { ticket } = await approvedTicket('available');
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const forbidden = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({});
    expect(forbidden.status).toBe(403);

    const { user: guard } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const badState = await request(app).post(`/api/trip-tickets/${ticket.id}/check-in`).set('Authorization', authHeader(guard.id, guard.email, 'security_guard')).send({});
    expect(badState.status).toBe(409); // still 'approved', not 'in_progress'
  });
});
