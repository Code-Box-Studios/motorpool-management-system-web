import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

const START_KM = 1000;

async function approvedTicket(
  vehicleStatus: 'available' | 'under_maintenance' | 'on_trip' = 'available'
) {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: START_KM, status: vehicleStatus, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({ data: { email: 'd@test.local', fullName: 'D', status: 'active', branchId: branch.id } });
  const ticket = await prisma.tripTicket.create({
    data: { branchId: branch.id, driverId: driver.id, vehicleId: vehicle.id, destination: 'A', purpose: 'P', dateRequested: new Date('2026-07-10'), preparedBy: '', status: 'approved' }
  });
  return { vehicle, ticket };
}

const guardHeader = async () => {
  const { user } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
  return { guard: user, header: authHeader(user.id, user.email, 'security_guard') };
};

describe('trip-ticket guard transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('check-out: approved → in_progress, records the guard and the odometer, flips vehicle to on_trip', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { guard, header } = await guardHeader();
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', header).send({ startMileage: START_KM });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.preTripGuardId).toBe(guard.id);
    expect(res.body.preTripCheckedById).toBe(guard.id);
    expect(res.body.preTripCheckedAt).not.toBeNull();
    expect(res.body.startMileage).toBe(START_KM);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('on_trip');
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: vehicle.id, newStatus: 'on_trip' } })).toBe(1);
  });

  // Was: "check-out still succeeds but SKIPS the vehicle flip". It did — which is
  // how a guard could release a van sitting in the workshop and leave the record
  // saying it was in the shop and on the road at the same time.
  it('check-out REFUSES to release a vehicle that is not available, and changes nothing', async () => {
    const { vehicle, ticket } = await approvedTicket('under_maintenance');
    const { header } = await guardHeader();
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', header).send({ startMileage: START_KM });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_NOT_AVAILABLE');
    expect((await prisma.tripTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe('approved');
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('under_maintenance');
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: vehicle.id } })).toBe(0);
  });

  it('check-out REFUSES a second trip on a vehicle already on the road', async () => {
    const { ticket } = await approvedTicket('on_trip');
    const { header } = await guardHeader();
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', header).send({ startMileage: START_KM });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_NOT_AVAILABLE');
  });

  it('check-in: in_progress → completed, records post-trip guard, and ADVANCES the odometer', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { guard, header } = await guardHeader();
    await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', header).send({ startMileage: START_KM });
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-in`).set('Authorization', header).send({ endMileage: START_KM + 250 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.postTripGuardId).toBe(guard.id);
    expect(res.body.endMileage).toBe(START_KM + 250);

    const after = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(after.status).toBe('available');
    // The whole point: this is the ONLY thing that moves the odometer, and every
    // preventive and predictive maintenance number is computed from it.
    expect(after.mileage).toBe(START_KM + 250);
  });

  it('rejects an odometer reading that runs backwards', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { header } = await guardHeader();
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', header).send({ startMileage: START_KM - 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ODOMETER_BACKWARDS');
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).mileage).toBe(START_KM);
  });

  it('requires an odometer reading at the gate', async () => {
    const { ticket } = await approvedTicket('available');
    const { header } = await guardHeader();
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', header).send({});
    expect(res.status).toBe(400);
  });

  it('403 for non-guard, 409 for the wrong from-state', async () => {
    const { ticket } = await approvedTicket('available');
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const forbidden = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({ startMileage: START_KM });
    expect(forbidden.status).toBe(403);

    const { header } = await guardHeader();
    const badState = await request(app).post(`/api/trip-tickets/${ticket.id}/check-in`).set('Authorization', header).send({ endMileage: START_KM });
    expect(badState.status).toBe(409); // still 'approved', not 'in_progress'
  });
});
