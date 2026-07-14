import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

// Nothing used to check any of this. A trip could be booked on a van that was
// out of service; it could end before it started; and the same van AND the same
// driver could be booked twice over for the same hours — right through to the
// guard checking both trips out and two trips running on one vehicle.
const app = createApp();

async function scaffold() {
  const branch = await createTestBranch();
  const mk = async (plate: string, vin: string, status: 'available' | 'out_of_service' = 'available') =>
    prisma.vehicle.create({
      data: {
        make: 'T', model: 'H', year: 2021, vin, licensePlate: plate, capacity: 5,
        fuelType: 'diesel', mileage: 1000, status, branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
      }
    });
  const vehicle = await mk('P1', 'V1');
  const otherVehicle = await mk('P2', 'V2');
  const deadVehicle = await mk('P3', 'V3', 'out_of_service');
  const driver = await prisma.driver.create({ data: { email: 'd1@test.local', fullName: 'D1', status: 'active', branchId: branch.id } });
  const otherDriver = await prisma.driver.create({ data: { email: 'd2@test.local', fullName: 'D2', status: 'active', branchId: branch.id } });
  const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
  return {
    branch, vehicle, otherVehicle, deadVehicle, driver, otherDriver,
    header: authHeader(admin.id, admin.email, 'admin'),
    adminId: admin.id
  };
}

type Scaffold = Awaited<ReturnType<typeof scaffold>>;

const body = (s: Scaffold, over: Record<string, unknown> = {}) => ({
  branchId: s.branch.id,
  driverId: s.driver.id,
  vehicleId: s.vehicle.id,
  destination: 'Site A',
  purpose: 'Delivery',
  dateRequested: '2026-07-10',
  participants: ['Alice'],
  requestedById: s.adminId,
  startTs: '2026-08-01T08:00:00.000Z',
  endTs: '2026-08-01T17:00:00.000Z',
  ...over
});

const post = (s: Scaffold, over: Record<string, unknown> = {}) =>
  request(app).post('/api/trip-tickets').set('Authorization', s.header).send(body(s, over));

describe('trip-ticket booking rules', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('refuses a vehicle that is out of service', async () => {
    const s = await scaffold();
    const res = await post(s, { vehicleId: s.deadVehicle.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_OUT_OF_SERVICE');
  });

  it('refuses a trip that ends before it starts', async () => {
    const s = await scaffold();
    const res = await post(s, {
      startTs: '2026-08-01T17:00:00.000Z',
      endTs: '2026-08-01T08:00:00.000Z'
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRIP_WINDOW');
  });

  it('refuses to double-book the same VEHICLE for an overlapping window', async () => {
    const s = await scaffold();
    expect((await post(s)).status).toBe(201);
    // Same van, different driver, overlapping hours.
    const clash = await post(s, {
      driverId: s.otherDriver.id,
      startTs: '2026-08-01T12:00:00.000Z',
      endTs: '2026-08-01T20:00:00.000Z'
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('VEHICLE_DOUBLE_BOOKED');
  });

  it('refuses to double-book the same DRIVER for an overlapping window', async () => {
    const s = await scaffold();
    expect((await post(s)).status).toBe(201);
    // Different van, same driver, overlapping hours — one person, two vehicles.
    const clash = await post(s, {
      vehicleId: s.otherVehicle.id,
      startTs: '2026-08-01T12:00:00.000Z',
      endTs: '2026-08-01T20:00:00.000Z'
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('DRIVER_DOUBLE_BOOKED');
  });

  it('allows the same vehicle back-to-back when the windows do not overlap', async () => {
    const s = await scaffold();
    expect((await post(s)).status).toBe(201); // 08:00 - 17:00
    const next = await post(s, {
      startTs: '2026-08-01T17:00:00.000Z', // starts exactly as the first ends
      endTs: '2026-08-01T20:00:00.000Z'
    });
    expect(next.status).toBe(201);
  });

  it('a cancelled trip releases its vehicle and driver for the same window', async () => {
    const s = await scaffold();
    const first = await post(s);
    expect(first.status).toBe(201);
    const cancelled = await request(app)
      .post(`/api/trip-tickets/${first.body.id}/cancel`)
      .set('Authorization', s.header)
      .send({ reason: 'not needed' });
    expect(cancelled.status).toBe(200);

    // The window is free again — a terminal trip holds nothing.
    expect((await post(s)).status).toBe(201);
  });
});

describe('trip-ticket off-ramps', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('an APPROVED trip that is no longer needed can be cancelled', async () => {
    const s = await scaffold();
    const created = await post(s);
    await request(app).post(`/api/trip-tickets/${created.body.id}/approve`).set('Authorization', s.header)
      .send({ liters: 20, fuelType: 'diesel', date: '2026-08-01', purpose: 'p', tripTo: 't' });
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    await request(app).post(`/api/trip-tickets/${created.body.id}/approve-evp`)
      .set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({});

    // Previously 409 INVALID_TRANSITION: an approved-but-unwanted trip had no
    // exit at all except deleting the record or driving it to completion.
    const res = await request(app).post(`/api/trip-tickets/${created.body.id}/cancel`)
      .set('Authorization', s.header).send({ reason: 'meeting called off' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');

    const allocation = await prisma.fuelAllocation.findUniqueOrThrow({ where: { tripTicketId: created.body.id } });
    expect(allocation.status).toBe('cancelled'); // the fuel budget is released with it
  });

  it('a COMPLETED trip cannot be deleted', async () => {
    const s = await scaffold();
    const created = await post(s);
    await prisma.tripTicket.update({ where: { id: created.body.id }, data: { status: 'completed' } });

    // Previously 204 — and the fuel allocation cascaded away with it, erasing an
    // approved fuel spend for a trip that physically happened.
    const res = await request(app).delete(`/api/trip-tickets/${created.body.id}`).set('Authorization', s.header);
    expect(res.status).toBe(409);
    expect(await prisma.tripTicket.count({ where: { id: created.body.id } })).toBe(1);
  });
});
